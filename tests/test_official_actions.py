import copy
import io
import json
from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from collector.official_actions import assess, publish, run, scope_for
from collector.official_prices import REGIONS


class OfficialActionsTests(unittest.TestCase):
    def setUp(self):
        self.started = datetime.now(timezone.utc).replace(microsecond=0)
        self.scope = {('chatgpt', 'us', 'web'), ('chatgpt', 'ph', 'web')}
        self.rows = [{'app': a, 'region': r, 'channel': c, 'status': 'ok',
                      'observed_at': self.started.isoformat()} for a, r, c in sorted(self.scope)]

    def test_retained_unrelated_and_failed_prices_do_not_pass(self):
        old = (self.started - timedelta(days=1)).isoformat()
        result = {'prices': [{**r, 'observed_at': old} for r in self.rows], 'failures': []}
        result['prices'].append({**self.rows[0], 'app': 'gemini'})
        self.assertFalse(assess(result, self.scope, self.started)['accepted'])
        result['prices'] = copy.deepcopy(self.rows)
        result['failures'] = [{'app': 'chatgpt', 'region': 'ph', 'channel': 'web', 'error': '403'}]
        report = assess(result, self.scope, self.started)
        self.assertFalse(report['accepted'])
        self.assertEqual(report['successful_sources'], 1)

    def test_each_app_channel_must_pass_its_own_threshold(self):
        scope = {('chatgpt', str(i), 'ios') for i in range(10)} | self.scope
        rows = [{**self.rows[0], 'region': str(i), 'channel': 'ios'} for i in range(10)]
        report = assess({'prices': rows, 'failures': []}, scope, self.started)
        self.assertFalse(report['accepted'])  # 10/12 overall cannot conceal 0/2 web
        report = assess({'prices': self.rows, 'failures': []}, self.scope, self.started)
        self.assertTrue(report['accepted'])

    def test_stale_missing_invalid_and_future_observations_are_not_fresh(self):
        for fields in [{'stale': True}, {'status': 'missing'}, {'observed_at': 'invalid'},
                       {'observed_at': (self.started + timedelta(hours=1)).isoformat()}]:
            with self.subTest(fields=fields):
                report = assess({'prices': [{**r, **fields} for r in self.rows], 'failures': []}, self.scope, self.started)
                self.assertFalse(report['accepted'])

    def test_supported_scope_and_collection_exclude_openai_web(self):
        self.assertEqual(len(scope_for('supported', REGIONS)), 70)
        self.assertNotIn(('chatgpt', 'us', 'web'), scope_for('supported', REGIONS))
        with patch('collector.official_actions.refresh', side_effect=[{'first': True}, {'second': True}]) as refresh:
            self.assertEqual(run({}, 'supported', REGIONS), {'second': True})
        self.assertEqual(refresh.call_args_list[0].kwargs['channels'], ('ios',))
        self.assertEqual([a['id'] for a in refresh.call_args_list[1].kwargs['apps']], ['gemini'])
        self.assertEqual(refresh.call_args_list[1].args[0], {'first': True})

    def test_publish_sends_the_snapshot_to_the_collector_endpoint_only(self):
        token = 't' * 32
        for target in ['http://site.test', 'https://user@site.test', 'https://site.test/api', '']:
            with self.subTest(target=target), self.assertRaises(ValueError):
                publish({}, target, token)
        with self.assertRaises(ValueError):
            publish({}, 'https://site.test', 'short')
        response = io.BytesIO(b'{"ok": true, "changed": true}')
        with patch('collector.official_actions.urlopen', return_value=response) as urlopen:
            self.assertEqual(publish({'collected_at': '2026-11-11'}, 'https://site.test/', token),
                             {'ok': True, 'changed': True})
        request = urlopen.call_args.args[0]
        self.assertEqual((request.full_url, request.get_method()), ('https://site.test/api/collector/official', 'PUT'))
        self.assertEqual(request.get_header('Authorization'), f'Bearer {token}')
        self.assertEqual(json.loads(request.data), {'collected_at': '2026-11-11'})
        refused = HTTPError('https://site.test', 409, 'Conflict', {}, io.BytesIO('快照早于线上版本'.encode()))
        with patch('collector.official_actions.urlopen', side_effect=refused), \
                self.assertRaisesRegex(RuntimeError, '409 快照早于线上版本'):
            publish({}, 'https://site.test', token)


if __name__ == '__main__':
    unittest.main()
