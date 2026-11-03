import json
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.error import HTTPError

from collector.official_prices import APPS, REGIONS, refresh
from collector.official_web import (
    OPENAI_URL, GOOGLE_PAGE, parse_openai, parse_google, discover_google_feed,
    read_evidence, collect_web,
)

PH = next(r for r in REGIONS if r['code'] == 'ph')
US = REGIONS[0]
STAMP = '2026-10-01T00:00:00+00:00'
FX = {'source': 'fixture', 'updated_at': STAMP, 'rates': {'USD': 1, 'PHP': 60, 'CNY': 7}}


def openai(country='PH', currency='PHP'):
    return {'country_code': country, 'currency_config': {
        'symbol_code': currency, 'tax_percent': 12,
        'plus': {'month': {'amount': 1100, 'tax': 'inclusive',
                          'psp_override': {'amount': 982.14, 'tax': 'exclusive'}},
                 'year': {'amount': 916.67, 'tax': 'inclusive'}}}}


class OfficialWebTests(unittest.TestCase):
    def test_openai_keeps_inclusive_and_pretax_without_guessing_annual_total(self):
        rows = parse_openai(openai(), PH)
        self.assertEqual(rows, [{'plan': 'plus-month', 'price': 1100, 'tax': 'inclusive', 'currency': 'PHP',
                                 'pretax_price': 982.14, 'tax_percent': 12}])

    def test_wrong_country_currency_and_invalid_amounts_are_rejected(self):
        for payload in (openai('US'), openai(currency='US$')):
            with self.assertRaises(ValueError):
                parse_openai(payload, PH)
        for price in (True, 0, -1, float('nan'), float('inf'), '1100'):
            payload = openai()
            payload['currency_config']['plus']['month']['amount'] = price
            with self.assertRaises(ValueError):
                parse_openai(payload, PH)

    def test_google_identity_and_separate_ultra_tiers_without_tax_inference(self):
        payload = {'COUNTRY_CODE': 'PH', 'CURRENCY_CODE': 'PHP', 'PRICE_GEN_AI_PRO_MONTHLY': 1100,
                   'PRICE_GEN_AI_ULTRA_100_MONTHLY': 5999, 'PRICE_GEN_AI_ULTRA_200_MONTHLY': 11900,
                   'PRICE_2048_MONTHLY': 599}
        rows = parse_google(payload, PH)
        self.assertEqual([r['plan'] for r in rows], ['pro-month', 'ultra5-month', 'ultra20-month'])
        self.assertTrue(all(r['tax'] == 'unknown' for r in rows))
        with self.assertRaises(ValueError):
            parse_google({**payload, 'CURRENCY_CODE': ''}, PH)

    def test_official_billing_currency_overrides_the_regions_usual_currency(self):
        tr = next(r for r in REGIONS if r['code'] == 'tr')
        data = openai('TR', 'USD')
        data['currency_config']['plus']['month'] = {'amount': 20, 'tax': 'exclusive'}
        rows, errors, _ = collect_web([APPS[0]], [tr], lambda u: (u, json.dumps(data)),
                                     STAMP, lambda s: None, currencies={'USD'})
        self.assertEqual(errors, [])
        self.assertEqual((rows[0]['currency'], rows[0]['price']), ('USD', 20))
        rows, errors, _ = collect_web([APPS[0]], [tr], lambda u: (u, json.dumps(data)),
                                     STAMP, lambda s: None, currencies={'TRY'})
        self.assertEqual(rows, [])
        self.assertEqual(len(errors), 1)

    def test_google_feed_version_discovered_from_current_official_asset(self):
        calls = []
        def fetch(url):
            calls.append(url)
            if url == GOOGLE_PAGE:
                return url, '<script src="https://evil.example/pricing.js"></script><script src="/about/assets/new.js"></script>'
            return url, 'const version="pricing_2030_01_01.json";'
        self.assertEqual(discover_google_feed(fetch), 'pricing_2030_01_01.json')
        self.assertEqual(len(calls), 2)
        self.assertTrue(calls[-1].startswith('https://one.google.com/about/assets/'))
        with self.assertRaises(ValueError):
            discover_google_feed(lambda u: (u, '<html>no version</html>'))
        with self.assertRaises(ValueError):
            discover_google_feed(lambda u: ('https://evil.example/', 'pricing_2030_01_01.json'))

    def test_failure_preserves_true_observation_and_unselected_channel(self):
        old = {'app': 'chatgpt', 'plan': 'plus-month', 'region': 'ph', 'channel': 'web',
               'status': 'ok', 'source_url': OPENAI_URL + 'PH', 'price': 1100, 'currency': 'PHP',
               'observed_at': STAMP, 'tax': 'inclusive'}
        ios = {**old, 'channel': 'ios', 'price': 999}
        previous = {'collected_at': STAMP, 'prices': [old, ios], 'failures': []}
        def blocked(url, *args):
            raise HTTPError(url, 403, 'Forbidden', {}, None)
        result = refresh(previous, ['web'], [APPS[0]], [PH], blocked, FX, lambda s: None)
        web = next(p for p in result['prices'] if p['channel'] == 'web')
        kept_ios = next(p for p in result['prices'] if p['channel'] == 'ios')
        self.assertEqual(web['observed_at'], STAMP)
        self.assertTrue(web['stale'])
        self.assertNotEqual(web['attempted_at'], STAMP)
        self.assertEqual(kept_ios['observed_at'], STAMP)
        self.assertNotIn('stale', kept_ios)
        self.assertEqual(result['failures'][0]['channel'], 'web')
        # A later successful response clears stale state and uses its actual capture time.
        captured = {'observed_at': STAMP, 'data': openai()}
        result = refresh(result, ['web'], [APPS[0]], [PH], blocked, FX, lambda s: None,
                         evidence={OPENAI_URL + 'PH': captured})
        web = next(p for p in result['prices'] if p['channel'] == 'web')
        self.assertFalse(web['stale'])
        self.assertEqual(web['observed_at'], STAMP)
        self.assertEqual(web['pretax_price'], 982.14)
        self.assertEqual(result['failures'], [])

    def test_forbidden_request_stops_other_uncaptured_regions(self):
        calls = []
        def fetch(url):
            calls.append(url)
            raise HTTPError(url, 403, 'Forbidden', {}, None)
        prices, failures, checked = collect_web([APPS[0]], [US, PH], fetch, STAMP, lambda s: None)
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(failures), 2)
        self.assertEqual(prices, [])

    def test_capture_rejects_nonofficial_urls_old_naive_and_future_times(self):
        now = datetime.now(timezone.utc)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'evidence.json'
            valid = {'source_url': OPENAI_URL + 'PH', 'observed_at': now.isoformat(), 'data': openai()}
            p.write_text(json.dumps([valid]))
            self.assertIn(OPENAI_URL + 'PH', read_evidence(p))
            for change in ({'source_url': 'https://priceai.cc/api/prices'},
                           {'observed_at': (now - timedelta(days=8)).isoformat()},
                           {'observed_at': (now + timedelta(days=1)).isoformat()},
                           {'observed_at': '2026-01-01T00:00:00'}):
                p.write_text(json.dumps([{**valid, **change}]))
                with self.assertRaises(ValueError):
                    read_evidence(p)
            p.write_text(json.dumps([valid, valid]))
            with self.assertRaises(ValueError):
                read_evidence(p)


if __name__ == '__main__':
    unittest.main()
