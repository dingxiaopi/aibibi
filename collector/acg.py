"""Read-only adapter for allowlisted AcgFaka storefronts.

Only public category/list GETs and item HTML. Never calls trade/pay/card APIs.
"""
import json
import re
import time
from html.parser import HTMLParser
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from collector.sources import ClosedShop, UnsupportedItem

def origin(seed):
    value=seed['origin'].rstrip('/')
    parts=urlsplit(value)
    if parts.scheme!='https' or not parts.hostname or parts.username or parts.password or parts.port or parts.path:
        raise ValueError('独立站来源必须为已登记HTTPS域名')
    return value

def read(seed,path):
    req=Request(origin(seed)+path,headers={'User-Agent':'AI-Bijia-Research/1.0','Accept':'application/json,text/html'})
    try:
        with urlopen(req,timeout=25) as r:
            body=r.read(2*1024*1024+1)
            if len(body)>2*1024*1024:raise ValueError('源站响应超限')
            return body.decode('utf-8')
    except HTTPError as exc:
        if path == '/' and exc.code == 410: raise ClosedShop('原店首页返回HTTP 410 Gone，确认已移除') from exc
        raise

class Description(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False);self.level=0;self.capture=0;self.parts=[]
    def handle_starttag(self,tag,attrs):
        if tag in ('div', 'section', 'article'):
            self.level+=1
            if not self.capture and set(dict(attrs).get('class','').split()) & {'item-detail','tokyo-description-panel','drawer-shop__description'}:self.capture=self.level
        if self.capture:self.parts.append(self.get_starttag_text())
    def handle_endtag(self,tag):
        if self.capture:self.parts.append('</'+tag+'>')
        if tag in ('div', 'section', 'article'):
            if self.capture==self.level:self.capture=0
            self.level-=1
    def handle_data(self,data):
        if self.capture:self.parts.append(data)
    def handle_entityref(self,name):
        if self.capture:self.parts.append('&'+name+';')
    def handle_charref(self,name):
        if self.capture:self.parts.append('&#'+name+';')

def storefront(seed):
    if seed.get('adapter') == 'jsonld':
        from collector import jsonld
        return jsonld.storefront(seed)
    if seed.get('adapter') == 'dujiao_next':
        from collector import dujiao
        return dujiao.storefront(seed)
    home=read(seed,'/')
    if '/assets/user/' not in home and '/assets/static/acg.js' not in home and seed.get('adapter') != 'acg_public':
        raise ValueError('未识别为受支持的公开商城')
    result=json.loads(read(seed,'/user/api/index/commodity'))
    rows=result.get('data');total=result.get('total')
    if result.get('code')!=200 or not isinstance(rows,list) or not isinstance(total,int) or len(rows)>total or len({x.get('id') for x in rows})!=len(rows):
        raise ValueError('独立站商品列表不完整')
    title=re.search(r'<title[^>]*>(.*?)</title>',home,re.S|re.I)
    name=re.sub(r'\s+',' ',title.group(1)).strip() if title else seed['name']
    items=[{**x,'goods_no':'N'+str(x['id']),'shop_no':seed['id']} for x in rows if x.get('status')==1 and x.get('hide')==0]
    # Some deployments count hidden/login-only items in total but omit them
    # from the anonymous response. Verify selected details individually; never
    # infer disappearance from this visibility-limited list.
    return {'shop_no':seed['id'],'name':name,'merchant':{},'listing_complete':len(rows)==total},items

def has_price_options(config):
    if not config:
        return False
    # Observed on public shelves: this lone flag records previously applied
    # markup, not selectable SKUs. Unknown pricing configuration stays blocked.
    if isinstance(config, dict) and set(config) == {'local_pricing'}:
        metadata = config['local_pricing']
        if isinstance(metadata, dict) and set(metadata) <= {'draft_markup_once'}:
            return not all(isinstance(v, (str, int, bool)) and v in (0, 1, '0', '1')
                           for v in metadata.values())
    return True


def detail(seed,item):
    if seed.get('adapter') == 'jsonld':
        from collector import jsonld
        return jsonld.detail(seed,item)
    if seed.get('adapter') == 'dujiao_next':
        from collector import dujiao
        return dujiao.detail(seed,item)
    gid=item['goods_no']
    if not re.fullmatch(r'N\d+',gid):raise ValueError('无效商品ID')
    source=read(seed,'/item/'+gid[1:])
    match=re.search(r'setVar\(["\']_var_item["\'],\s*(.*?)\);',source,re.S)
    if not match:raise ValueError('商品详情格式不支持或源站验证')
    raw=json.loads(match.group(1))
    if raw.get('id')!=int(gid[1:]) or raw.get('status')!=1:raise ValueError('商品详情身份或状态不匹配')
    if has_price_options(raw.get('config')) or raw.get('seckill_status'):
        raise UnsupportedItem('商品包含多规格或限时价，需单独适配后才能发布报价')
    parser=Description();parser.feed(source)
    if not parser.parts:raise ValueError('商品说明不可读取')
    qty=raw.get('stock')
    if isinstance(qty,str) and qty.isdigit():qty=int(qty)
    hidden=bool(raw.get('inventory_hidden'))
    if hidden and raw.get('is_stock') and (not isinstance(qty,(int,float)) or qty<=0):
        qty=None
    return {**raw,'goods_no':gid,'shop_no':seed['id'],'description':''.join(parser.parts),
            'price':float(raw['price']),'stock_available_quantity':qty,
            'stock_available_status':'out' if raw.get('is_stock') is False else 'in_stock' if hidden and raw.get('is_stock') is True else '', 'hide_stock_count':hidden}
