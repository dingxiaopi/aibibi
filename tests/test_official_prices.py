import json
import unittest
from collector.official_prices import APPS, PLANS, REGIONS, collect, match_plan, parse_add_ons, unmatched

APP = APPS[0]
US = REGIONS[0]


def page(items, region=US, app=APP):
    add_ons = [{'name': name, 'price': shown,
                'buyParams': f"productType=A&price={milli}&offerName={offer}&appAdamId={app_id or app['app_store_id']}"}
               for name, shown, milli, offer, app_id in items]
    return f"<html>{region['storefront']}<script>{{\"addOns\":{json.dumps(add_ons)},\"x\":1}}</script></html>"


ITEMS = [
    ('ChatGPT Plus', '$19.99', 19990, 'oai_chatgpt_plus_1999_1m', None),
    ('ChatGPT Plus', '$200.00', 200000, 'oai_chatgpt_plus_20000_1y', None),
    ('ChatGPT Go', '$8.00', 8000, 'oai_chatgpt_go_1000_1m', None),
    ('Other App Item', '$1.00', 1000, 'x_1m', '999'),
]
URL = 'https://apps.apple.com/us/app/chatgpt/id6448311069'


class OfficialPriceTests(unittest.TestCase):
    def test_parses_only_this_apps_items_with_milli_prices(self):
        items = parse_add_ons(page(ITEMS), APP, US, URL)
        self.assertEqual([i['price'] for i in items], [19.99, 200.0, 8.0])

    def test_rejects_redirected_storefront(self):
        with self.assertRaises(ValueError):
            parse_add_ons(page(ITEMS), APP, US, 'https://apps.apple.com/cn/iphone/today')

    def test_monthly_and_yearly_plans_are_separated(self):
        items = parse_add_ons(page(ITEMS), APP, US, URL)
        plans = {p['id']: p for p in PLANS if p['app'] == 'chatgpt'}
        self.assertEqual(match_plan(plans['plus-month'], items)[1]['price'], 19.99)
        self.assertEqual(match_plan(plans['plus-year'], items)[1]['price'], 200.0)
        self.assertEqual(match_plan(plans['pro200-month'], items)[0], 'missing')

    def test_conflicting_candidates_need_review_instead_of_a_guess(self):
        items = [{'name': 'ChatGPT Plus', 'display_price': '', 'price': p, 'offer': o}
                 for p, o in ((19.99, 'a_1m'), (24.99, 'b_1m'))]
        plan = next(p for p in PLANS if p['id'] == 'plus-month')
        self.assertEqual(match_plan(plan, items)[0], 'review')

    def test_unknown_items_are_reported_but_credits_are_not(self):
        grok = [p for p in PLANS if p['app'] == 'grok']
        items = [{'name': n} for n in ('SuperGrok', 'Extra Usage Credits 5 USD', 'Grok Premium')]
        self.assertEqual(unmatched(grok, items), {'Grok Premium'})

    def test_failed_page_is_recorded_and_other_regions_continue(self):
        fx = {'rates': {'CNY': 7.0, 'USD': 1.0, **{r['currency']: 2.0 for r in REGIONS if r['currency'] != 'USD'}}}

        def fake(url, headers):
            if '/tr/' in url:
                raise OSError('timeout')
            region = next(r for r in REGIONS if f"/{r['code']}/" in url)
            app = next(a for a in APPS if a['app_store_id'] in url)
            return url, page(ITEMS if app is APP else [], region, app)

        result = collect(fetch_page=fake, fx=fx, pause=lambda s: None)
        self.assertIn({'app': 'chatgpt', 'region': 'tr', 'error': 'timeout'}, result['failures'])
        plus_us = next(p for p in result['prices'] if (p['app'], p['plan'], p['region']) == ('chatgpt', 'plus-month', 'us'))
        self.assertEqual((plus_us['cny'], plus_us['usd']), (139.93, 19.99))
        self.assertFalse(any(p['region'] == 'tr' for p in result['prices']))


if __name__ == '__main__':
    unittest.main()
