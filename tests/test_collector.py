import copy
import json
from pathlib import Path
import tempfile
import unittest
from collector.collect import collect, fingerprint, inventory, normalize, retire_unlisted

ITEM = {'goods_no': 'G12345', 'shop_no': 'S12345', 'name': 'Plus月卡', 'description': '<p>30天直充，封号不保</p>', 'price': 99, 'stock_available_quantity': 5, 'stock_available_status': 'low'}
MAPPING = {'shop_id': 'S12345', 'sku': 'plus', 'accepted_fingerprint': fingerprint(ITEM), 'channel': '测试渠道', 'warranty': '封号不保', 'spec_evidence': '30天直充'}
CONFIG = {'shops': [{'id': 'S12345'}], 'products': [{'id': 'plus'}], 'mappings': {'G12345': MAPPING}}

def fake(endpoint, payload):
    if endpoint == 'shop/detail':
        return {'shop_no': 'S12345', 'name': '测试店', 'merchant': {}}
    if endpoint == 'goods/list':
        return {'list': [ITEM]}
    return ITEM

class CollectorTests(unittest.TestCase):
    def test_negative_hidden_inventory_is_unknown(self):
        self.assertEqual(inventory({'stock_available_quantity': -1, 'stock_available_status': ''}), ('unknown', None))
        self.assertEqual(inventory({'stock_available_quantity': 0}), ('out', 0))
        self.assertEqual(inventory({'stock_available_quantity': 4, 'stock_available_status': 'out'}), ('unknown', None))

    def test_delayed_redemption_not_counted_ready(self):
        item = {**ITEM, 'description': '<p>目前ios限购！需要等10.13再兑换！</p>'}
        mapping = {**MAPPING, 'accepted_fingerprint': fingerprint(item)}
        quote = normalize(item, {'id': 'S12345'}, mapping, '2026-10-12T00:00:00+00:00')
        self.assertEqual(quote['stock_status'], 'in_stock')
        self.assertEqual(quote['availability'], 'delayed')
        self.assertIn('10.13', quote['availability_note'])

    def test_changed_spec_rejected_even_when_price_valid(self):
        with self.assertRaises(ValueError):
            normalize({**ITEM, 'name': '共享周卡'}, {'id': 'S12345'}, MAPPING, 'now')

    def test_daily_update_reuses_approved_mapping_after_description_change(self):
        config = copy.deepcopy(CONFIG)
        config['mapping_updates'] = [{'shop_id': 'S12345', 'goods_id': 'G12345', 'raw': ITEM}]
        changed = {**ITEM, 'description': '<p>30天直充，新增客服联系方式</p>', 'price': 88}
        def source(endpoint, payload):
            return changed if endpoint == 'goods/detail' else fake(endpoint, payload)
        result = collect(config, {}, fetch=source, pause=lambda _: None)
        self.assertEqual(result['quotes'][0]['price'], 88)
        self.assertEqual(result['quotes'][0]['sku'], MAPPING['sku'])
        self.assertEqual(result['quotes'][0]['classified_item_name'], ITEM['name'])
        self.assertEqual(result['review_items'], [])
        self.assertEqual(config['mappings']['G12345']['accepted_fingerprint'], fingerprint(ITEM))

    def test_daily_update_pauses_changed_duration_without_refreshing_price_or_evidence(self):
        previous = collect(CONFIG, {}, fetch=fake, pause=lambda _: None)
        def source(endpoint, payload):
            return {**ITEM, 'name': 'Plus共享周卡', 'price': 20} if endpoint == 'goods/detail' else fake(endpoint, payload)
        result = collect(CONFIG, previous, fetch=source, pause=lambda _: None)
        self.assertEqual(result['quotes'][0]['collection_status'], 'needs_review')
        self.assertEqual(result['quotes'][0]['price'], 99)
        self.assertIn('变化', result['review_items'][0]['reason'])

    def test_classification_title_remains_the_original_across_repeated_updates(self):
        first = collect(CONFIG, {}, fetch=fake, pause=lambda _: None)
        def source(endpoint, payload):
            return {**ITEM, 'name': 'Plus月卡 新客服', 'description': '文案更新', 'price': 90} if endpoint == 'goods/detail' else fake(endpoint, payload)
        second = collect(CONFIG, first, fetch=source, pause=lambda _: None)
        third = collect(CONFIG, second, fetch=source, pause=lambda _: None)
        self.assertEqual(third['quotes'][0]['classified_item_name'], ITEM['name'])
        self.assertEqual(third['quotes'][0]['collection_status'], 'ok')

    def test_reused_classification_cannot_cross_shop_or_lack_original_title(self):
        with self.assertRaisesRegex(ValueError, '缺少首次分类'):
            normalize({**ITEM, 'description': '新文案'}, {'id': 'S12345'}, MAPPING, 'now', reuse_classification=True)
        config = copy.deepcopy(CONFIG)
        config['mappings']['G12345']['shop_id'] = 'other-shop'
        result = collect(config, {}, fetch=fake, pause=lambda _: None)
        self.assertFalse(result['quotes'])
        for item in ({**ITEM, 'name': ''}, {**ITEM, 'shop_no': 'other-shop'}):
            with self.assertRaises(ValueError):
                normalize(item, {'id': 'S12345'}, MAPPING, 'now', reuse_classification=True,
                          reviewed_title=ITEM['name'])

    def test_bad_price_rejected(self):
        for price in [0, -1, float('nan'), float('inf'), True, '99']:
            with self.assertRaises(ValueError):
                normalize({**ITEM, 'price': price}, {'id': 'S12345'}, MAPPING, 'now')

    def test_shop_failure_preserves_last_success_time_and_price(self):
        first = collect(CONFIG, {}, fetch=fake, pause=lambda _: None)
        def failure(*args):
            raise TimeoutError('timeout')
        second = collect(CONFIG, first, fetch=failure, pause=lambda _: None)
        self.assertEqual(second['quotes'][0]['price'], 99)
        self.assertEqual(second['quotes'][0]['checked_at'], first['quotes'][0]['checked_at'])
        self.assertEqual(second['quotes'][0]['stock_status'], 'in_stock')
        self.assertEqual(second['quotes'][0]['collection_status'], 'failed')
        self.assertEqual(second['stats']['ready_quotes'], 0)

    def test_missing_listing_not_reported_as_sold_out(self):
        first = collect(CONFIG, {}, fetch=fake, pause=lambda _: None)
        def missing(endpoint, payload):
            return {'list': []} if endpoint == 'goods/list' else fake(endpoint, payload)
        second = collect(CONFIG, first, fetch=missing, pause=lambda _: None)
        self.assertEqual(second['quotes'][0]['listing_status'], 'not_listed')
        self.assertEqual(second['quotes'][0]['stock_status'], 'in_stock')
        self.assertEqual(second['stats']['quotes'], 0)

    def test_confirmed_unlisted_monitor_is_disabled_and_not_reintroduced(self):
        conf = copy.deepcopy(CONFIG)
        first = collect(conf, {}, fetch=fake, pause=lambda _: None)
        def missing(endpoint, payload):
            return {'list': []} if endpoint == 'goods/list' else fake(endpoint, payload)
        second = collect(conf, first, fetch=missing, pause=lambda _: None)
        retired = retire_unlisted(conf, second)
        self.assertIn('S12345:G12345', retired)
        self.assertEqual(retired['S12345:G12345']['confirmed_at'], second['quotes'][0]['attempted_at'])
        self.assertIn('G12345', conf['mappings'])
        self.assertEqual(retire_unlisted(conf, second), {})
        calls = []
        def returned(endpoint, payload):
            calls.append(endpoint)
            return fake(endpoint, payload)
        third = collect(conf, second, fetch=returned, pause=lambda _: None)
        self.assertNotIn('goods/detail', calls)
        self.assertEqual(third['quotes'], [])
        self.assertEqual(third['review_items'], [])
        fourth = collect(conf, second, fetch=missing, pause=lambda _: None)
        self.assertEqual(fourth['quotes'], [])
        def failure(*args):
            raise TimeoutError('timeout')
        self.assertEqual(collect(conf, second, fetch=failure, pause=lambda _: None)['quotes'], [])

    def test_transient_failure_partial_shelf_and_sold_out_do_not_retire_monitors(self):
        conf = copy.deepcopy(CONFIG)
        first = collect(conf, {}, fetch=fake, pause=lambda _: None)
        for changes in [
            {'collection_status': 'failed'},
            {'collection_status': 'needs_review'},
            {'collection_status': 'ok', 'listing_status': 'listed', 'stock_status': 'out'},
        ]:
            snapshot = copy.deepcopy(first)
            snapshot['quotes'][0].update(changes)
            self.assertEqual(retire_unlisted(conf, snapshot), {})
        partial = copy.deepcopy(first)
        partial['shops'][0]['listing_complete'] = False
        partial['quotes'][0].update(collection_status='not_listed', listing_status='not_listed', attempted_at='2026-10-20T00:00:00Z')
        self.assertEqual(retire_unlisted(conf, partial), {})

    def test_unknown_product_goes_to_review(self):
        conf = copy.deepcopy(CONFIG)
        conf['mappings'] = {}
        result = collect(conf, {}, fetch=fake, pause=lambda _: None)
        self.assertEqual(len(result['quotes']), 0)
        self.assertEqual(len(result['review_items']), 1)

    def test_detail_identity_cannot_cross_shop(self):
        def wrong(endpoint, payload):
            return {**ITEM, 'shop_no': 'S99999'} if endpoint == 'goods/detail' else fake(endpoint, payload)
        result = collect(CONFIG, {}, fetch=wrong, pause=lambda _: None)
        self.assertEqual(result['stats']['quotes'], 0)
        self.assertIn('身份', result['review_items'][0]['reason'])

    def test_capture_keeps_changed_details_for_review_without_approving_them(self):
        first = collect(CONFIG, {}, fetch=fake, pause=lambda _: None)
        changed_item = {**ITEM, 'name': 'Plus共享周卡', 'description': '7天共享账号', 'price': 9}
        def changed(endpoint, payload):
            return changed_item if endpoint == 'goods/detail' else fake(endpoint, payload)
        events = []
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            result = collect(CONFIG, first, fetch=changed, pause=lambda _: None,
                             capture_dir=path, progress=events.append)
            review = json.loads((path/'S12345--G12345.json').read_text())
            self.assertEqual(review['raw']['name'], 'Plus共享周卡')
            self.assertEqual(review['previous_fingerprint'], MAPPING['accepted_fingerprint'])
            self.assertNotEqual(review['fingerprint'], review['previous_fingerprint'])
            self.assertEqual(result['quotes'][0]['collection_status'], 'needs_review')
            self.assertEqual(result['quotes'][0]['price'], 99)
            self.assertEqual(result['stats']['ready_quotes'], 0)
            self.assertEqual(events[0]['completed'], 1)
            self.assertEqual(CONFIG['mappings']['G12345']['accepted_fingerprint'], fingerprint(ITEM))

if __name__ == '__main__':
    unittest.main()
