import unittest
from collector.dujiao import storefront, detail

class DujiaoTests(unittest.TestCase):
    def test_complete_public_pagination_and_shop_scoped_ids(self):
        def fetch(seed, path):
            if path == 'config': return {'data': {'brand': {'site_name': 'Source shop'}}}
            page = 1 if 'page=1&' in path else 2
            rows = [{'id': page, 'title': {'zh-CN': '商品'+str(page)}, 'price_amount': '1.00'}]
            return {'data': rows, 'pagination': {'page': page, 'total': 2}}
        info, items = storefront({'id': 'A_shop'}, fetch)
        self.assertEqual(info['name'], 'Source shop')
        self.assertTrue(info['listing_complete'])
        self.assertEqual([x['goods_no'] for x in items], ['N1', 'N2'])
        self.assertTrue(all(x['shop_no'] == 'A_shop' for x in items))
        with self.assertRaisesRegex(ValueError, 'slug'):
            detail({'id': 'A_shop'}, items[0])

    def test_sku_prices_and_stock_do_not_use_base_or_other_variant(self):
        product = {'id': 1, 'slug': 'grok', 'title': {'zh-CN': 'Grok'}, 'content': {'zh-CN': '全程订阅质保'}, 'price_amount': '1', 'fulfillment_type': 'auto', 'skus': [
            {'id': 9, 'is_active': True, 'spec_values': {'zh-CN': 'Plus 月付'}, 'price_amount': '65', 'stock_quantity_hidden': True, 'stock_status': 'in_stock', 'is_sold_out': False},
            {'id': 10, 'is_active': True, 'spec_values': {'zh-CN': 'Ultra 月付'}, 'price_amount': '700', 'stock_quantity_hidden': True, 'stock_status': 'out_of_stock', 'is_sold_out': True}]}
        def fetch(seed,path):
            return {'data': {'brand': {'site_name': 'shop'}}} if path == 'config' else {'data': [product], 'pagination': {'page': 1, 'total': 1}}
        _, items = storefront({'id': 'A_shop'}, fetch)
        self.assertEqual([i['goods_no'] for i in items], ['N1V9', 'N1V10'])
        a,b = [detail({'id': 'A_shop'}, x) for x in items]
        self.assertEqual((a['price'],b['price']), (65,700))
        self.assertEqual(a['stock_available_status'], 'in_stock')
        self.assertIsNone(a['stock_available_quantity'])
        self.assertEqual(b['stock_available_quantity'],0)
        self.assertIn('Plus 月付',a['description'])

    def test_reject_duplicate_or_truncated_pages(self):
        for second in [[{'id': 1, 'title': 'duplicate'}], []]:
            def fetch(seed, path):
                if path == 'config': return {'data': {'brand': {'site_name': 'shop'}}}
                page = 1 if 'page=1&' in path else 2
                return {'data': [{'id': 1, 'title': 'first'}] if page == 1 else second,
                        'pagination': {'page': page, 'total': 2}}
            with self.assertRaises(ValueError): storefront({'id': 'A_shop'}, fetch)

    def test_reject_changing_totals_and_unverified_shop_name(self):
        with self.assertRaises(ValueError): storefront({}, lambda s,p: {'data': {}})
        def fetch(seed, path):
            if path == 'config': return {'data': {'brand': {'site_name': 'shop'}}}
            page = 1 if 'page=1&' in path else 2
            return {'data': [{'id': page, 'title': 'item'}], 'pagination': {'page': page, 'total': 2 if page == 1 else 3}}
        with self.assertRaises(ValueError): storefront({'id': 'A_shop'}, fetch)

if __name__ == '__main__': unittest.main()
