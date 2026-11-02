import unittest
from collector.expand import candidates, merge

class ExpansionTests(unittest.TestCase):
    def test_only_safe_source_urls_become_candidates_and_existing_are_skipped(self):
        config = {'shops': [{'id': 'W_existing'}, {'id': 'A_known', 'origin': 'https://known.example'}]}
        directory = {'shops_index': [
            {'url': 'https://wzyp.cn/shop/new?from=affiliate', 'name': 'new'},
            {'url': 'https://wzyp.cn/shop/existing'},
            {'url': 'https://known.example/'},
            {'url': 'https://user:pass@evil.example/'},
            {'url': 'http://insecure.example/'},
            {'url': 'https://new.example/?aff=ignored', 'name': 'independent'},
            {'url': 'https://new.example/?aff=duplicate'},
        ]}
        rows = candidates(config, directory)
        self.assertEqual([s['id'] for s in rows], ['W_new', 'A_new_example'])
        self.assertEqual(rows[1]['origin'], 'https://new.example')
        self.assertNotIn('mappings', rows[0])

    def test_merge_retains_original_observation_times_and_does_not_approve_candidates(self):
        previous = {'shops': [{'id': 'old', 'collection_status': 'ok', 'checked_at': 'old-time', 'source_item_count': 3}],
                    'quotes': [{'shop_id': 'old', 'collection_status': 'ok', 'listing_status': 'listed', 'stock_status': 'in_stock', 'availability': 'ready', 'checked_at': 'old-time'}],
                    'review_items': [], 'collection_log': [], 'methodology': {}}
        fresh = {'generated_at': 'new-time', 'shops': [{'id': 'new', 'collection_status': 'ok', 'checked_at': 'new-time', 'source_item_count': 2}],
                 'quotes': [], 'review_items': [{'shop_id': 'new', 'goods_id': 'Wtest'}], 'collection_log': []}
        result = merge(previous, fresh, {'products': []})
        self.assertEqual(result['shops'][0]['checked_at'], 'old-time')
        self.assertEqual(result['quotes'][0]['checked_at'], 'old-time')
        self.assertEqual(result['stats']['shops'], 2)
        self.assertEqual(result['stats']['source_items'], 5)
        self.assertEqual(result['stats']['quotes'], 1)
        self.assertEqual(result['stats']['review_items'], 1)

if __name__ == '__main__': unittest.main()
