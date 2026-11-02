"""Read a registered store's complete schema.org offer catalogue and detail HTML."""
import hashlib
import json
import re
from html.parser import HTMLParser
from urllib.parse import urlsplit
from collector.acg import read, origin


def nodes(source):
    result = []
    for data in re.findall(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', source, re.S | re.I):
        value = json.loads(data)
        result.extend(value.get('@graph', [value]) if isinstance(value, dict) else value)
    return result


def identity(seed, url):
    u = urlsplit(url)
    if u.scheme + '://' + u.netloc != origin(seed) or u.query or u.fragment or not re.fullmatch(r'/products/[A-Za-z0-9_-]+', u.path):
        raise ValueError('结构化商品链接越过原店或路径异常')
    # Stable shop-scoped numeric identity, independent of shelf order.
    return 'N' + str(int(hashlib.sha256(u.path.encode()).hexdigest()[:12], 16)), u.path


def storefront(seed):
    data = nodes(read(seed, '/'))
    organization = next((n for n in data if n.get('@type') == 'Organization' and n.get('url') == origin(seed) + '/'), None)
    catalog = next((n for n in data if n.get('@type') == 'OfferCatalog'), None)
    if not organization or not organization.get('name') or not catalog:
        raise ValueError('商城身份或完整OfferCatalog不可核验')
    rows = catalog.get('itemListElement')
    if not isinstance(rows, list) or len(rows) != catalog.get('numberOfItems'):
        raise ValueError('结构化货架数量不完整')
    items, seen = [], set()
    for offer in rows:
        gid, path = identity(seed, offer.get('url', ''))
        product = offer.get('itemOffered', {})
        if offer.get('@type') != 'Offer' or gid in seen or not product.get('name'):
            raise ValueError('结构化货架商品身份异常')
        seen.add(gid)
        items.append({'goods_no': gid, 'shop_no': seed['id'], 'name': product['name'], 'source_path': path})
    return {'shop_no': seed['id'], 'name': organization['name'], 'merchant': {}, 'listing_complete': True}, items


class Details(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.capture = None
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ('div', 'p'):
            self.depth += 1
            if set(dict(attrs).get('class', '').split()) & {'glass-rich-detail-list', 'glass-copy', 'glass-subtitle'} and self.capture is None:
                self.capture = self.depth

    def handle_endtag(self, tag):
        if tag in ('div', 'p'):
            if self.capture == self.depth:
                self.capture = None
                self.parts.append('\n')
            self.depth -= 1

    def handle_data(self, data):
        if self.capture is not None:
            self.parts.append(data)


def detail(seed, item):
    source = read(seed, item['source_path'])
    product = next((n for n in nodes(source) if n.get('@type') == 'Product'), None)
    if not product or not isinstance(product.get('offers'), dict):
        raise ValueError('商品详情缺少单一Offer，不使用聚合起价')
    offer = product['offers']
    gid, path = identity(seed, offer.get('url', ''))
    if gid != item['goods_no'] or offer.get('@type') != 'Offer' or offer.get('priceCurrency') != 'CNY':
        raise ValueError('商品详情来源、币种或规格不匹配')
    parser = Details()
    parser.feed(source)
    if not parser.parts:
        raise ValueError('商品完整说明不可读取')
    stock = offer.get('availability')
    state = 'in_stock' if stock == 'https://schema.org/InStock' else 'out' if stock == 'https://schema.org/OutOfStock' else ''
    return {**item, 'name': product['name'], 'description': ''.join(parser.parts), 'price': float(offer['price']),
            'stock_available_quantity': 0 if state == 'out' else None,
            'stock_available_status': state, 'hide_stock_count': True}
