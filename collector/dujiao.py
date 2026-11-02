"""Read anonymous Dujiao Next public catalogues; no account or order endpoints.

Expand every active SKU separately; never use a multi-SKU product base price.
"""
import json
import re
import math
from urllib.parse import quote
from urllib.request import Request, urlopen
from collector.acg import origin


def read(seed, path):
    request = Request(origin(seed) + '/api/v1/public/' + path,
                      headers={'User-Agent': 'AI-Bijia-Research/1.0', 'Accept': 'application/json'})
    with urlopen(request, timeout=25) as response:
        body = response.read(2 * 1024 * 1024 + 1)
    if len(body) > 2 * 1024 * 1024:
        raise ValueError('公开商城响应超限')
    result = json.loads(body)
    if result.get('status_code') != 0 or 'data' not in result:
        raise ValueError('公开商城返回失败或验证页面')
    return result


def local_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get('zh-CN') or value.get('zh-TW') or value.get('en-US') or next((x for x in value.values() if x), '')
    return ''


def storefront(seed, fetch=read):
    config = fetch(seed, 'config')['data']
    name = config.get('brand', {}).get('site_name') if isinstance(config, dict) else None
    if not isinstance(name, str) or not name.strip():
        raise ValueError('公开商城名称不可核验')
    items, seen, expected = [], set(), None
    for page in range(1, 51):
        result = fetch(seed, 'products?page=' + str(page) + '&page_size=20')
        rows, pagination = result.get('data'), result.get('pagination', {})
        total = pagination.get('total')
        if (not isinstance(rows, list) or type(total) is not int or total < 0
                or pagination.get('page') != page or (expected is not None and total != expected)):
            raise ValueError('公开商城商品分页格式异常或总量变化')
        expected = total
        for row in rows:
            ident = row.get('id')
            title = local_text(row.get('title'))
            if type(ident) is not int or ident < 1 or ident in seen or not title:
                raise ValueError('公开商城商品ID重复、格式错误或标题缺失')
            seen.add(ident)
            skus = row.get('skus')
            if skus is None: skus = []
            if not isinstance(skus, list): raise ValueError('公开商城SKU格式异常')
            active = [sku for sku in skus if sku.get('is_active') is True]
            if skus and not active: continue
            sku_ids = set()
            for sku in active or [None]:
                if sku is not None:
                    if type(sku.get('id')) is not int or sku['id'] < 1 or sku['id'] in sku_ids: raise ValueError('公开商城SKU身份异常')
                    sku_ids.add(sku['id'])
                spec = local_text(sku.get('spec_values')) if sku else ''
                items.append({**row, '_selected_sku': sku, 'goods_no': 'N' + str(ident) + ('V' + str(sku['id']) if sku else ''), 'shop_no': seed['id'], 'name': title + (' · ' + spec if spec else '')})
        if len(seen) == total:
            break
        if not rows or len(seen) > total:
            raise ValueError('公开商城商品分页不完整')
    else:
        raise ValueError('公开商城分页超出采集上限')
    return {'shop_no': seed['id'], 'name': name, 'merchant': {}, 'listing_complete': True}, items


def detail(seed, item):
    # Each approval re-reads storefront(), which returns the current complete SKU.
    sku = item.get('_selected_sku')
    selected = sku or item
    slug = item.get('slug', '')
    if not re.fullmatch(r'[\w -]{1,200}', slug): raise ValueError('商品slug无效')
    if item.get('skus') and sku is None: raise ValueError('多SKU商品必须指定具体规格')
    price = float(selected.get('price_amount', 0))
    if not math.isfinite(price) or price <= 0: raise ValueError('SKU没有有效单件价')
    hidden = selected.get('stock_quantity_hidden', item.get('stock_quantity_hidden', True))
    state = selected.get('stock_status')
    sold_out = selected.get('is_sold_out')
    qty = None
    if hidden is False:
        mode = item.get('fulfillment_type')
        if mode == 'auto': qty = selected.get('auto_stock_available')
        elif mode == 'manual':
            total, sold = selected.get('manual_stock_total'), selected.get('manual_stock_sold')
            if type(total) is int and type(sold) is int: qty = max(0, total - sold)
        if type(qty) is not int or qty < 0: qty = None
    status = 'out' if sold_out is True or state == 'out_of_stock' else 'in_stock' if state == 'in_stock' and sold_out is False else ''
    description = local_text(item.get('description')) + '\n' + local_text(item.get('content'))
    if sku: description += '\n所选规格：' + local_text(sku.get('spec_values'))
    if item.get('min_purchase_quantity', 0) > 1: raise ValueError('商品设有起购数量，不能发布单件价格')
    return {**item, 'price': price, 'description': description,
            'source_path': '/products/' + quote(slug, safe=''), 'stock_available_quantity': 0 if status == 'out' else qty,
            'stock_available_status': status, 'hide_stock_count': hidden}

