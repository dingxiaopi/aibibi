import unittest
from collector.discover import discover, activate_supported

class DiscoveryTests(unittest.TestCase):
    def test_no_quotes_imported_and_tracking_removed(self):
        result=discover({'shops_index':[{'url':'https://www.16688.com.cn/shop/S123?aff=another','name':'shop','price':1,'stock_count':999}]})
        row=result['leads'][0]
        self.assertEqual(row['url'],'https://www.16688.com.cn/shop/S123')
        self.assertEqual(row['shop_id'],'S123')
        self.assertNotIn('price',row)
        self.assertNotIn('stock_count',row)

    def test_reject_unsafe_urls_and_untrusted_adapter_hints(self):
        result=discover({'shops_index':[{'url':'javascript:alert(1)'},{'url':'https://user:secret@example.com/'},{'url':'https://evil.example/shop/S123','platform':'jrsoft'}]})
        self.assertEqual(len(result['leads']),1)
        self.assertIsNone(result['leads'][0]['supported_adapter'])

    def test_dedup_and_preserve_first_seen(self):
        payload={'shops_index':[{'url':'https://example.com/shop/a?aff=x'},{'url':'https://example.com/shop/a?aff=y'}]}
        first=discover(payload)
        first['leads'][0]['first_seen']='2026-01-01'
        second=discover(payload,first)
        self.assertEqual(len(second['leads']),1)
        self.assertEqual(second['leads'][0]['first_seen'],'2026-01-01')

    def test_activation_is_idempotent_and_never_adds_mappings(self):
        queue=discover({'shops_index':[{'url':'https://www.16688.com.cn/shop/S123'}]})
        config={'shops':[],'mappings':{}}
        activate_supported(config,queue)
        activate_supported(config,queue)
        self.assertEqual(len(config['shops']),1)
        self.assertEqual(config['mappings'],{})

    def test_shop_limit_leaves_extra_leads_pending(self):
        queue=discover({'shops_index':[{'url':'https://www.16688.com.cn/shop/S123'}]})
        config={'shops':[{'id':'S999'}],'mappings':{},'shop_limit':1}
        activate_supported(config,queue)
        self.assertEqual(len(config['shops']),1)
        self.assertEqual(queue['leads'][0]['status'],'capacity_pending')

    def test_disappeared_leads_not_automatically_activated(self):
        prior=discover({'shops_index':[{'url':'https://www.16688.com.cn/shop/S123'}]})
        next_queue=discover({'shops_index':[]},prior)
        config=activate_supported({'shops':[],'mappings':{}},next_queue)
        self.assertEqual(config['shops'],[])

if __name__=='__main__':unittest.main()
