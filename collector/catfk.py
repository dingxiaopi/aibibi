"""Catfk public Jingsoft shelves; share the validated schema, not source identity."""
import gzip
import json
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from collector import wzyp
from collector.sources import ClosedShop

_last_request = 0.0
_blocked = False


def request(endpoint, payload):
    global _last_request, _blocked
    if _blocked:
        raise ValueError('catfk 本轮遇到限流或验证，停止剩余请求')
    time.sleep(max(0, 5 - (time.monotonic() - _last_request)))
    _last_request = time.monotonic()
    req = Request('https://catfk.com/shopApi/Shop/' + endpoint,
                  data=json.dumps(payload).encode(),
                  headers={'Content-Type': 'application/json', 'User-Agent': 'AI-Bijia-Research/1.0'})
    try:
        with urlopen(req, timeout=25) as response:
            data = response.read(2 * 1024 * 1024 + 1)
        if len(data) > 2 * 1024 * 1024:
            raise ValueError('catfk 响应超限')
        if data.startswith(b'\x1f\x8b'):
            data = gzip.decompress(data)
        if data.lstrip().startswith(b'<'):
            _blocked = True
            raise ValueError('catfk 返回验证页，停止本轮采集')
        result = json.loads(data)
    except HTTPError as exc:
        if exc.code in (403, 429):
            _blocked = True
        raise
    if result.get('code') != 1 or not isinstance(result.get('data'), dict):
        message = str(result.get('msg', '公开接口格式异常'))[:180]
        if endpoint == 'info' and message in ('店铺不存在', '店铺链接不存在', '店铺已关闭', '店铺已注销'):
            raise ClosedShop(message)
        raise ValueError('catfk: ' + message)
    return result['data']


def storefront(seed, fetch=request):
    info, items = wzyp.storefront(seed, fetch=fetch)
    return info, [{**item, 'goods_no': 'C' + item['goods_no'][1:]} for item in items]


def detail(seed, item, fetch=request):
    raw = wzyp.detail(seed, item, fetch=fetch)
    return {**raw, 'goods_no': 'C' + raw['goods_no'][1:]}
