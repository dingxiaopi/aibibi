import unittest
from unittest.mock import Mock
from collector.sources import ClosedShop, directory_url
from collector.expand import candidates
from collector.collect import collect
from collector.refresh import replace_shops

class SourceLifecycleTests(unittest.TestCase):
    def test_current_directory_uses_original_platform_identity_not_go_host(self):
        rows = {'shops_index': [
            {'url':'https://shuita.xyz/go/abc','platform':'ldxp','url_host':'wzyp.cn','token':'source'},
            {'url':'https://shuita.xyz/go/def','platform':'catfk','url_host':'catfk.com','token':'mrnf'},
            {'url':'https://shuita.xyz/go/ghi','platform':'dujiao_next','url_host':'shop.example','token':'shop.example'},
        ]}
        seeds = candidates({'shops':[]},rows)
        self.assertEqual({s['id'] for s in seeds}, {'W_source','C_mrnf','A_shop_example'})
        self.assertNotIn('shuita.xyz',str(seeds).replace('https://shuita.xyz/shops',''))
        self.assertIsNone(directory_url({'url':'https://shuita.xyz/go/unknown'}))
        self.assertIsNone(directory_url({'url':'https://shuita.xyz/go/x','platform':'catfk','url_host':'catfk.com','token':'catfk-mrnf'}))

    def test_closed_shop_remains_disabled_and_makes_no_future_requests(self):
        seed = {'id':'S123'}
        config = {'shops':[seed],'mappings':{},'products':[]}
        fetch = Mock(side_effect=ClosedShop('店铺已关闭'))
        first = collect(config,{},fetch=fetch,pause=lambda x:None)
        self.assertFalse(seed['enabled'])
        self.assertEqual(first['shops'][0]['collection_status'],'disabled')
        self.assertEqual(seed['closure_evidence']['url'],'https://www.16688.com.cn/shop/S123')
        fetch.reset_mock()
        second = collect(config,first,fetch=fetch,pause=lambda x:None)
        fetch.assert_not_called()
        self.assertEqual(second['shops'][0]['disabled_at'],seed['disabled_at'])

    def test_temporary_failure_does_not_retire_source_and_retry_is_attempted(self):
        seed = {'id':'S123'}
        config = {'shops':[seed],'mappings':{},'products':[]}
        fetch = Mock(side_effect=TimeoutError('timed out'))
        first = collect(config,{},fetch=fetch,pause=lambda x:None)
        self.assertNotIn('disabled_at',seed)
        collect(config,first,fetch=fetch,pause=lambda x:None)
        self.assertEqual(fetch.call_count,2)

    def test_partial_refresh_preserves_other_shops_observation_time(self):
        old={'shops':[{'id':'old','collection_status':'ok','checked_at':'original','source_item_count':2}], 'quotes':[], 'review_items':[], 'collection_log':[]}
        fresh={'generated_at':'new','shops':[{'id':'new','collection_status':'failed'}],'quotes':[],'review_items':[],'collection_log':[]}
        result=replace_shops(old,fresh,[])
        self.assertEqual(result['shops'][0]['checked_at'],'original')

if __name__ == '__main__':unittest.main()
