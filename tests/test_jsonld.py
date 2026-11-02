import json
import unittest
from unittest.mock import patch
from collector import jsonld

class StructuredStoreTests(unittest.TestCase):
    seed={'id':'A_store','origin':'https://store.test'}
    def page(self,nodes,body=''):
        return '<script type="application/ld+json">'+json.dumps({'@graph':nodes})+'</script>'+body
    def test_complete_catalog_and_full_detail_with_hidden_stock(self):
        url='https://store.test/products/grok'
        catalog=self.page([{'@type':'Organization','name':'Source','url':'https://store.test/'},{'@type':'OfferCatalog','numberOfItems':1,'itemListElement':[{'@type':'Offer','url':url,'itemOffered':{'name':'Grok'}}]}])
        product=self.page([{'@type':'Product','name':'Grok Premium 月卡','offers':{'@type':'Offer','url':url,'priceCurrency':'CNY','price':'120','availability':'https://schema.org/InStock'}}],'<p class="glass-subtitle">充值到自己账号</p><div class="glass-rich-detail-list"><div>全程订阅质保；不支持覆盖</div></div>')
        with patch('collector.jsonld.read',side_effect=[catalog,product]):
            shop,items=jsonld.storefront(self.seed)
            raw=jsonld.detail(self.seed,items[0])
        self.assertTrue(shop['listing_complete'])
        self.assertEqual(raw['price'],120)
        self.assertEqual(raw['stock_available_status'],'in_stock')
        self.assertIsNone(raw['stock_available_quantity'])
        self.assertIn('不支持覆盖',raw['description'])
        self.assertEqual(raw['source_path'],'/products/grok')
    def test_refuses_aggregate_price_or_off_origin_product_links(self):
        with self.assertRaises(ValueError):jsonld.identity(self.seed,'https://wrong.test/products/grok')
        item={'goods_no':'N1','source_path':'/products/grok'}
        with patch('collector.jsonld.read',return_value=self.page([{'@type':'Product','offers':{'@type':'AggregateOffer','lowPrice':1}}])):
            with self.assertRaises(ValueError):jsonld.detail(self.seed,item)

if __name__=='__main__':unittest.main()
