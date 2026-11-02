import json
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch
from collector import wzyp
from collector.review_batch import Observer
from collector.sources import UnlistedItem

SEED = {'id': 'W_demo', 'platform': 'wzyp', 'source_token': 'demo'}

def row(key='abc', owner='demo', count=2):
    return {'goods_key': key, 'user': {'token': owner}, 'status': 1,
            'extend': {'stock_count': count, 'show_stock_type': 1}}

class BatchObserverTests(unittest.TestCase):
    def test_only_complete_shelf_confirms_absence(self):
        from collector import acg
        with patch('collector.review_batch.api', return_value={'list': [], 'total': 0}), patch('time.sleep'):
            with self.assertRaises(UnlistedItem):
                Observer()({'id': 'S123', 'platform': '16688'}, 'G1')
        with patch.object(acg, 'storefront', return_value=({'listing_complete': False}, [])):
            try:
                Observer()({'id': 'A_demo', 'platform': 'acg'}, 'N1')
            except UnlistedItem:
                self.fail('A partial public shelf cannot confirm delisting')
            except ValueError:
                pass
            else:
                self.fail('Missing item should not be inspected')
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def capture(self, age=0, token='demo'):
        at = (datetime.now(timezone.utc) - timedelta(seconds=age)).isoformat()
        (self.directory / 'W_demo.json').write_text(json.dumps({
            'seed': {**SEED, 'source_token': token}, 'checked_at': at,
            'items': [{'goods_no': 'Wabc', 'goods_key': 'abc'}]}))
        return at

    def test_approval_reads_current_page_and_keeps_its_time(self):
        old = self.capture(age=7200)
        observer = Observer(self.directory)
        with patch.object(wzyp, 'request', return_value={'list': [row(count=0)]}) as request, \
             patch.object(wzyp, 'detail', side_effect=lambda seed, item: item):
            observed = observer(SEED, 'Wabc')
            observer(SEED, 'Wabc')
        request.assert_called_once_with('goodsList', {'token': 'demo', 'goods_type': 'card', 'current': 1, 'pageSize': 20})
        self.assertEqual(observed['raw']['stock_available_quantity'], 0)
        self.assertNotEqual(observed['inventory_checked_at'], old)

    def test_inspection_preserves_recent_capture_time(self):
        at = self.capture()
        with patch.object(wzyp, 'request') as request, \
             patch.object(wzyp, 'detail', side_effect=lambda seed, item: item):
            observed = Observer(self.directory, staged=True)(SEED, 'Wabc')
        request.assert_not_called()
        self.assertEqual(observed['inventory_checked_at'], at)

    def test_wrong_owner_changed_order_and_duplicate_ids_reject(self):
        self.capture()
        for rows in [[row(owner='other')], [row('moved')], [row(), row()]]:
            with self.subTest(rows=rows), patch.object(wzyp, 'request', return_value={'list': rows}), \
                 patch.object(wzyp, 'detail') as detail:
                with self.assertRaises(ValueError): Observer(self.directory)(SEED, 'Wabc')
                detail.assert_not_called()

    def test_expired_or_mismatched_hint_never_fetches(self):
        for age, token in [(49*3600, 'demo'), (0, 'other')]:
            self.capture(age, token)
            with patch.object(wzyp, 'request') as request:
                with self.assertRaisesRegex(ValueError, '过期或身份'): Observer(self.directory)(SEED, 'Wabc')
                request.assert_not_called()

if __name__ == '__main__': unittest.main()
