import json
import unittest
from unittest.mock import patch
from collector import acg
from collector.collect import fingerprint,mapping_key,normalize

SEED={'id':'A_demo','platform':'acg','origin':'https://demo.test','name':'Demo'}
def html(raw,description='一个月，直充自己号，封号不保'):
    return '<script>setVar("_var_item",'+json.dumps(raw)+');</script><div class="item-detail"><div class="panel-body"><p>'+description+'</p></div></div>'
RAW={'id':14,'name':'Pro 月卡','status':1,'price':99,'stock':4,'is_stock':True,'config':[]}
class AcgTests(unittest.TestCase):
    def test_public_item_extracts_only_description_and_original_stock(self):
        with patch.object(acg,'read',return_value=html(RAW)):
            raw=acg.detail(SEED,{'goods_no':'N14'})
        self.assertEqual(raw['shop_no'],'A_demo')
        self.assertEqual(raw['stock_available_quantity'],4)
        mapping={'sku':'pro','accepted_fingerprint':fingerprint(raw),'warranty':'封号不保','channel':'CDK','spec_evidence':'月卡'}
        q=normalize(raw,SEED,mapping,'2026-10-15T01:00:00Z')
        self.assertEqual(q['item_url'],'https://demo.test/item/14')
        self.assertEqual(q['stock_status'],'in_stock')
    def test_variant_and_wrong_identity_are_not_published_as_base_price(self):
        for raw in [{**RAW,'id':15},{**RAW,'config':{'套餐':['月','年']}}]:
            with patch.object(acg,'read',return_value=html(raw)):
                with self.assertRaises(ValueError):acg.detail(SEED,{'goods_no':'N14'})
    def test_markup_provenance_is_not_a_selectable_variant_or_applied_twice(self):
        record = {**RAW, 'price': 10.98, 'config': {'local_pricing': {'draft_markup_once': '1'}}}
        with patch.object(acg, 'read', return_value=html(record)):
            item = acg.detail(SEED, {'goods_no': 'N14'})
        self.assertEqual(item['price'], 10.98)
        self.assertEqual(item['goods_no'], 'N14')

    def test_other_local_pricing_configuration_and_flash_sales_remain_blocked(self):
        for record in [
            {**RAW, 'config': {'local_pricing': {'prices': [10, 20]}}},
            {**RAW, 'config': {'local_pricing': {'draft_markup_once': '1'}, '套餐': ['月', '年']}},
            {**RAW, 'config': {'local_pricing': {'draft_markup_once': '1'}}, 'seckill_status': 1},
        ]:
            with self.subTest(record=record), patch.object(acg, 'read', return_value=html(record)):
                with self.assertRaises(ValueError):
                    acg.detail(SEED, {'goods_no': 'N14'})

    def test_drawer_description_section_stops_before_footer_and_keeps_full_terms(self):
        document = ('<script>setVar("_var_item",'+json.dumps(RAW)+');</script>'
            '<section class="drawer-shop__description"><div><h2>商品详情</h2></div>'
            '<div class="drawer-shop__richtext"><p>30天直充</p><img src="demo"><br/>封号不保</div></section>'
            '<footer><div>其他商品年卡，不是本商品</div></footer>')
        with patch.object(acg, 'read', return_value=document):
            item = acg.detail(SEED, {'goods_no': 'N14'})
        self.assertIn('30天直充', item['description'])
        self.assertIn('封号不保', item['description'])
        self.assertNotIn('其他商品', item['description'])
    def test_visibility_limited_listing_is_explicitly_not_complete(self):
        with patch.object(acg,'read',side_effect=['<title>Demo</title>/assets/user/',json.dumps({'code':200,'total':2,'data':[{**RAW,'hide':0}]})]):
            info,items=acg.storefront(SEED)
        self.assertFalse(info['listing_complete'])
        self.assertEqual(len(items),1)
    def test_store_local_numeric_ids_do_not_collide_in_mapping_keys(self):
        config={'mappings':{}}
        self.assertNotEqual(mapping_key(config,'A_one','N14'),mapping_key(config,'A_two','N14'))
        self.assertEqual(mapping_key(config,'S123','G456'),'G456')
    def test_explicit_hidden_stock_does_not_invent_quantity(self):
        with patch.object(acg,'read',return_value=html({**RAW,'stock':0,'inventory_hidden':1})):
            raw=acg.detail(SEED,{'goods_no':'N14'})
        m={'sku':'pro','accepted_fingerprint':fingerprint(raw),'warranty':'首登','channel':'CDK','spec_evidence':'月卡'}
        q=normalize(raw,SEED,m,'2026-10-15T01:00:00Z')
        self.assertEqual(q['stock_status'],'in_stock');self.assertIsNone(q['stock_count'])

if __name__=='__main__':unittest.main()
