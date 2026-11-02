"""Read-only adapter for wzyp.cn public card storefronts; no checkout requests."""
import json
import gzip
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from collector.sources import ClosedShop
ORIGIN = 'https://wzyp.cn'

_last_request = 0.0
_blocked = False

def request(endpoint, payload):
    global _last_request, _blocked
    if _blocked:
        raise ValueError('wzyp 本轮已遇到限流或验证，停止该平台剩余请求')
    time.sleep(max(0, 5 - (time.monotonic() - _last_request)))
    _last_request = time.monotonic()
    req = Request(ORIGIN + '/shopApi/Shop/' + endpoint, data=json.dumps(payload).encode(),
                  headers={'Content-Type':'application/json', 'User-Agent':'AI-Bijia-Research/1.0'})
    try:
        with urlopen(req, timeout=25) as response:
            body = response.read()
            if response.headers.get('Content-Encoding') == 'gzip' or body.startswith(b'\x1f\x8b'):
                body = gzip.decompress(body)
            if response.headers.get('X-Tengine-Error') == 'denied by http_ratelimit' or body.lstrip().startswith(b'<'):
                _blocked = True
                raise ValueError('wzyp 请求被限流或要求验证；停止该平台本轮采集')
            result = json.loads(body)
    except HTTPError as exc:
        if exc.code in (403, 429):
            _blocked = True
        raise
    if result.get('code') != 1 or not isinstance(result.get('data'), dict):
        message = str(result.get('msg', '公开接口格式异常'))[:180]
        if endpoint == 'info' and message in ('店铺不存在', '店铺链接不存在', '店铺已关闭', '店铺已注销'):
            raise ClosedShop(message)
        raise ValueError('wzyp: ' + message)
    return result['data']

def convert(item, seed, listing=None):
    if item.get('user', {}).get('token') != seed['source_token']:
        raise ValueError('wzyp 商品详情店铺身份不匹配')
    key = item.get('goods_key', '')
    import re
    if not re.fullmatch(r'[A-Za-z0-9_]+', key):
        raise ValueError('Invalid wzyp goods key')
    ext = (listing or item).get('extend', {})
    return {**item, 'goods_no':'W'+key, 'shop_no':seed['id'],
            'stock_available_quantity':ext.get('stock_count'),
            'stock_available_status':'out' if ext.get('stock_count') == 0 else '',
            'hide_stock_count':ext.get('show_stock_type') == 0}

def storefront(seed, fetch=request):
    token = seed['source_token']
    info = fetch('info', {'token':token})
    if info.get('token') != token or not info.get('nickname'):
        raise ValueError('wzyp 店铺身份不匹配')
    items, seen = [], set()
    # Use ordinary public pagination; require a complete listing before inferring absence.
    for page in range(1, 51):
        result = fetch('goodsList', {'token':token, 'goods_type':'card', 'current':page, 'pageSize':20})
        rows, total = result.get('list'), result.get('total')
        if not isinstance(rows,list) or isinstance(total,bool) or not isinstance(total,int) or total < 0:
            raise ValueError('wzyp 商品分页格式异常')
        for row in rows:
            converted = convert(row, seed)
            if converted['goods_no'] in seen:
                raise ValueError('wzyp 分页重复商品，不能确认完整列表')
            seen.add(converted['goods_no']); items.append(converted)
        if len(items) == total:
            break
        if not rows or len(items) > total:
            raise ValueError('wzyp 商品分页不完整')
    else:
        raise ValueError('wzyp 分页超出采集上限')
    return {'shop_no':seed['id'], 'name':info['nickname'], 'merchant':{'region':info.get('login_province','')}}, items

def detail(seed, item, fetch=request):
    raw = fetch('goodsInfo', {'goods_key':item['goods_key']})
    if raw.get('goods_key') != item['goods_key'] or raw.get('status') != 1:
        raise ValueError('wzyp 商品详情身份或上架状态异常')
    # Details omit inventory; use the separately observed public list stock.
    return convert(raw, seed, listing=item)
