import unittest
import gzip
from unittest.mock import patch
from io import BytesIO
from collector import wzyp
from collector.collect import fingerprint, normalize

SEED={'id':'W_demo','source_token':'demo','platform':'wzyp'}
def item(key='abc', count=3, show=1):
    return {'goods_key':key,'name':'Plus 菲区月卡','description':'30天订阅','price':125,
            'user':{'token':'demo'},'extend':{'stock_count':count,'show_stock_type':show}}
class WzypTests(unittest.TestCase):
    def setUp(self):
        wzyp._blocked = False
        wzyp._last_request = 0.0

    def test_compressed_response_and_rate_limit_handling(self):
        response=BytesIO(gzip.compress(b'{"code":1,"data":{"token":"demo"}}'))
        response.headers={'Content-Encoding':'gzip'}
        with patch.object(wzyp,'urlopen',return_value=response), patch.object(wzyp.time,'sleep'):
            self.assertEqual(wzyp.request('info',{})['token'],'demo')
        response=BytesIO(gzip.compress(b'<html>verification</html>'))
        response.headers={'Content-Encoding':'gzip','X-Tengine-Error':'denied by http_ratelimit'}
        with patch.object(wzyp,'urlopen',return_value=response) as opening, patch.object(wzyp.time,'sleep'):
            with self.assertRaisesRegex(ValueError,'限流'):wzyp.request('info',{})
            with self.assertRaisesRegex(ValueError,'本轮已遇到'):wzyp.request('info',{})
            self.assertEqual(opening.call_count,1)

    def test_pagination_collects_all_pages(self):
        def fetch(ep,p):
            if ep=='info':return {'token':'demo','nickname':'Shop'}
            return {'total':2,'list':[item('a' if p['current']==1 else 'b')]}
        _,rows=wzyp.storefront(SEED,fetch)
        self.assertEqual([x['goods_no'] for x in rows],['Wa','Wb'])
    def test_incomplete_page_is_not_successful_absence(self):
        def fetch(ep,p):
            if ep=='info':return {'token':'demo','nickname':'Shop'}
            return {'total':2,'list':[item()] if p['current']==1 else []}
        with self.assertRaises(ValueError):wzyp.storefront(SEED,fetch)
    def test_duplicate_page_rejected(self):
        def fetch(ep,p):
            return {'token':'demo','nickname':'Shop'} if ep=='info' else {'total':2,'list':[item()]}
        with self.assertRaises(ValueError):wzyp.storefront(SEED,fetch)
    def test_cross_shop_detail_rejected(self):
        row=item();row['user']['token']='other'
        with self.assertRaises(ValueError):wzyp.convert(row,SEED)
    def test_hidden_stock_retains_availability_without_exposing_count(self):
        row=wzyp.convert(item(show=0),SEED)
        mapping={'accepted_fingerprint':fingerprint(row),'sku':'plus-phi','channel':'菲区','warranty':'商家声明','spec_evidence':'30天'}
        q=normalize(row,SEED,mapping,'2026-10-13T00:00:00+00:00')
        self.assertEqual(q['stock_status'],'in_stock');self.assertIsNone(q['stock_count'])
        self.assertEqual(q['item_url'],'https://wzyp.cn/item/abc')
    def test_detail_uses_observed_list_stock_and_validates_status(self):
        listing=wzyp.convert(item(count=0),SEED)
        raw=item();raw.pop('extend');raw['status']=1
        row=wzyp.detail(SEED,listing,lambda ep,p:raw)
        self.assertEqual(row['stock_available_quantity'],0)
        raw['status']=0
        with self.assertRaises(ValueError):wzyp.detail(SEED,listing,lambda ep,p:raw)
