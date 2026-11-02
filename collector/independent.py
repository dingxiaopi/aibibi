"""Public NikoCard directory adapter. Unreviewed/partial-payment listings never become quotes."""
import json
from urllib.request import Request, urlopen
ORIGIN='https://nikoers.com'
def get(path):
    with urlopen(Request(ORIGIN+path,headers={'User-Agent':'AI-Bijia-Research/1.0'}),timeout=25) as r:
        return json.load(r)
def storefront(seed):
    if seed['id']!='N_nikocard':raise ValueError('Unknown independent storefront')
    categories=get('/user/api/index/data')
    result=get('/user/api/index/commodity')
    if categories.get('code')!=200 or result.get('code')!=200 or not isinstance(result.get('data'),list):
        raise ValueError('Independent storefront returned invalid data')
    rows=result['data']
    if len(rows)!=result.get('total') or len({x.get('id') for x in rows})!=len(rows):
        raise ValueError('Independent storefront list is incomplete')
    count=next((x.get('commodity_count') for x in categories['data'] if x.get('id')=='recommend'),None)
    if count!=len(rows):raise ValueError('Independent storefront category count mismatch')
    items=[{**x,'goods_no':'N'+str(x['id']),'description':'','shop_no':seed['id']} for x in rows if x.get('status')==1 and x.get('hide')==0]
    return {'shop_no':seed['id'],'name':'NikoCard','merchant':{'region':''}},items
