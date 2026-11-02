import unittest
from unittest.mock import patch
from collector import independent
from collector.collect import collect

class IndependentTests(unittest.TestCase):
    def test_partial_payment_listing_stays_in_review(self):
        rows=[{'id':68,'name':'Plus 一个月150RMB 下单后补差价','price':10,'status':1,'hide':0}]
        responses=[{'code':200,'data':[{'id':'recommend','commodity_count':1}]},{'code':200,'data':rows,'total':1}]
        with patch.object(independent,'get',side_effect=responses):
            result=collect({'shops':[{'id':'N_nikocard','platform':'independent'}],'mappings':{},'products':[]},{},pause=lambda _:None)
        self.assertEqual(result['stats']['shops_ok'],1)
        self.assertEqual(result['quotes'],[])
        self.assertIn('补差价',result['review_items'][0]['reason'])
    def test_incomplete_directory_rejected(self):
        responses=[{'code':200,'data':[{'id':'recommend','commodity_count':2}]},{'code':200,'data':[],'total':2}]
        with patch.object(independent,'get',side_effect=responses):
            with self.assertRaises(ValueError):independent.storefront({'id':'N_nikocard'})
    def test_collection_rejects_more_than_configured_limit(self):
        with self.assertRaisesRegex(ValueError,'上限'):
            collect({'shops':[{},{}],'shop_limit':1},{})
