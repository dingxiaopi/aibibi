#!/usr/bin/env python3
"""Collect official App Store in-app subscription prices per region. Python stdlib only.

Reads the public App Store product page of each app in each storefront, takes the
embedded in-app purchase list ("addOns"), and matches it to known plans. A plan
that is missing or ambiguous is recorded as such; no price is ever guessed.

    python3 -m collector.official_prices            # writes cloudflare/shared/official-prices.json
    python3 -m collector.official_prices --dry-run  # prints a summary only
"""
import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'cloudflare/shared/official-prices.json'
FX_URL = 'https://open.er-api.com/v6/latest/USD'
USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)'

APPS = [
    {'id': 'chatgpt', 'name': 'ChatGPT', 'provider': 'OpenAI', 'slug': 'chatgpt', 'app_store_id': '6448311069'},
    {'id': 'claude', 'name': 'Claude', 'provider': 'Anthropic', 'slug': 'claude-by-anthropic', 'app_store_id': '6473753684'},
    {'id': 'gemini', 'name': 'Gemini', 'provider': 'Google', 'slug': 'google-gemini', 'app_store_id': '6477489729'},
    {'id': 'grok', 'name': 'Grok', 'provider': 'xAI', 'slug': 'grok', 'app_store_id': '6670324846'},
]

# name/offer are regular expressions on the App Store item name and its offerName.
PLANS = [
    {'app': 'chatgpt', 'id': 'go-month', 'label': 'ChatGPT Go', 'period': 'month', 'name': r'^ChatGPT Go$', 'offer': r'_1m$'},
    {'app': 'chatgpt', 'id': 'plus-month', 'label': 'ChatGPT Plus', 'period': 'month', 'name': r'^ChatGPT Plus$', 'offer': r'_1m$'},
    {'app': 'chatgpt', 'id': 'plus-year', 'label': 'ChatGPT Plus 年付', 'period': 'year', 'name': r'^ChatGPT Plus$', 'offer': r'_1y$'},
    {'app': 'chatgpt', 'id': 'pro100-month', 'label': 'ChatGPT Pro 100', 'period': 'month', 'name': r'^ChatGPT Pro 100$', 'offer': r'_1m$'},
    {'app': 'chatgpt', 'id': 'pro200-month', 'label': 'ChatGPT Pro 200', 'period': 'month', 'name': r'^ChatGPT Pro 200$', 'offer': r'_1m$'},
    {'app': 'chatgpt', 'id': 'pro500-month', 'label': 'ChatGPT Pro 500', 'period': 'month', 'name': r'^ChatGPT Pro 500$', 'offer': r'_1m$'},
    {'app': 'claude', 'id': 'pro-month', 'label': 'Claude Pro', 'period': 'month', 'name': r'^Claude Pro - Monthly$', 'offer': r'monthly'},
    {'app': 'claude', 'id': 'pro-year', 'label': 'Claude Pro 年付', 'period': 'year', 'name': r'^Claude Pro - Annual$', 'offer': r'yearly'},
    {'app': 'claude', 'id': 'max5-month', 'label': 'Claude Max 5x', 'period': 'month', 'name': r'^Claude Max 5x - Monthly$', 'offer': r'monthly'},
    {'app': 'claude', 'id': 'max20-month', 'label': 'Claude Max 20x', 'period': 'month', 'name': r'^Claude Max 20x - Monthly$', 'offer': r'monthly'},
    {'app': 'gemini', 'id': 'plus-month', 'label': 'Google AI Plus', 'period': 'month', 'name': r'^Google AI Plus\b', 'offer': r'^com\.google\.gemini\.helium\.m(\.|$)'},
    {'app': 'gemini', 'id': 'pro-month', 'label': 'Google AI Pro', 'period': 'month', 'name': r'^Google AI Pro\b', 'offer': r'^com\.google\.gemini\.(2tb\.ai|ai\.2tb)\.m(\.|$)'},
    {'app': 'gemini', 'id': 'ultra-month', 'label': 'Google AI Ultra', 'period': 'month', 'name': r'^Google AI Ultra\b', 'offer': r'^com\.google\.gemini\.30tb\.ai\.pro\.m(\.|$)'},
    {'app': 'grok', 'id': 'lite-month', 'label': 'SuperGrok Lite', 'period': 'month', 'name': r'^SuperGrok Lite$', 'offer': r'\.monthly\.'},
    {'app': 'grok', 'id': 'super-month', 'label': 'SuperGrok', 'period': 'month', 'name': r'^SuperGrok$', 'offer': r'\.monthly\.'},
    {'app': 'grok', 'id': 'super-year', 'label': 'SuperGrok 年付', 'period': 'year', 'name': r'^SuperGrok$', 'offer': r'\.yearly\.'},
    {'app': 'grok', 'id': 'plus-month', 'label': 'SuperGrok Plus', 'period': 'month', 'name': r'^SuperGrok Plus$', 'offer': r'\.monthly\.'},
    {'app': 'grok', 'id': 'heavy-month', 'label': 'SuperGrok Heavy', 'period': 'month', 'name': r'^SuperGrok Heavy$', 'offer': r'\.monthly\.'},
]

# In-app items that are not subscription plans; anything else unmatched is reported as a possible new plan.
NOT_PLANS = [r'Credits', r'Tokens?\b', r'^\d+ ?[GT]B$']

# Apple storefront IDs make the store answer for that region regardless of the caller's IP.
REGIONS = [
    {'code': 'us', 'name': '美国', 'currency': 'USD', 'storefront': '143441'},
    {'code': 'ph', 'name': '菲律宾', 'currency': 'PHP', 'storefront': '143474'},
    {'code': 'tr', 'name': '土耳其', 'currency': 'TRY', 'storefront': '143480'},
    {'code': 'ng', 'name': '尼日利亚', 'currency': 'NGN', 'storefront': '143561'},
    {'code': 'pk', 'name': '巴基斯坦', 'currency': 'PKR', 'storefront': '143477'},
    {'code': 'eg', 'name': '埃及', 'currency': 'EGP', 'storefront': '143516'},
    {'code': 'in', 'name': '印度', 'currency': 'INR', 'storefront': '143467'},
    {'code': 'vn', 'name': '越南', 'currency': 'VND', 'storefront': '143471'},
    {'code': 'br', 'name': '巴西', 'currency': 'BRL', 'storefront': '143503'},
    {'code': 'cl', 'name': '智利', 'currency': 'CLP', 'storefront': '143483'},
    {'code': 'jp', 'name': '日本', 'currency': 'JPY', 'storefront': '143462'},
    {'code': 'hk', 'name': '中国香港', 'currency': 'HKD', 'storefront': '143463'},
    {'code': 'sg', 'name': '新加坡', 'currency': 'SGD', 'storefront': '143464'},
    {'code': 'gb', 'name': '英国', 'currency': 'GBP', 'storefront': '143444'},
]


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def fetch(url, headers=None, timeout=25):
    request = Request(url, headers={'User-Agent': USER_AGENT, 'Accept-Language': 'en-US', **(headers or {})})
    with urlopen(request, timeout=timeout) as response:
        return response.geturl(), response.read().decode('utf-8', 'replace')


def store_url(app, region):
    return f"https://apps.apple.com/{region['code']}/app/{app['slug']}/id{app['app_store_id']}"


def parse_add_ons(html, app, region, final_url):
    """Return [{name, display_price, price, offer}] for this app, or raise if the page is not the expected one."""
    if f"apps.apple.com/{region['code']}/app/" not in final_url or region['storefront'] not in html:
        raise ValueError('App Store 返回了其他地区或页面')
    start = html.find('"addOns":')
    if start < 0:
        raise ValueError('页面没有应用内购买列表')
    items, _ = json.JSONDecoder().raw_decode(html, start + len('"addOns":'))
    result = []
    for item in items:
        params = dict(parse_qsl(str(item.get('buyParams', ''))))
        if params.get('appAdamId') != app['app_store_id']:
            continue
        milli = params.get('price', '')
        if not milli.isdigit() or int(milli) <= 0:
            continue
        result.append({'name': str(item.get('name', '')).strip(), 'display_price': str(item.get('price', '')).strip(),
                       'price': int(milli) / 1000, 'offer': params.get('offerName', '')})
    if not result:
        raise ValueError('应用内购买列表为空或不属于该应用')
    return result


def match_plan(plan, items):
    """One price per plan: identical duplicates are fine, differing candidates need review."""
    found = [i for i in items if re.search(plan['name'], i['name']) and re.search(plan['offer'], i['offer'])]
    if not found:
        return 'missing', None, []
    prices = {i['price'] for i in found}
    if len(prices) > 1:
        return 'review', None, found
    return 'ok', found[0], found


def fx_rates():
    _, body = fetch(FX_URL)
    data = json.loads(body)
    if data.get('result') != 'success':
        raise ValueError('汇率接口返回失败')
    needed = {'CNY'} | {r['currency'] for r in REGIONS}
    rates = {k: float(v) for k, v in data['rates'].items() if k in needed}
    missing = needed - set(rates)
    if missing:
        raise ValueError('汇率缺少币种：' + ','.join(sorted(missing)))
    return {'source': 'open.er-api.com', 'base': 'USD', 'updated_at': data.get('time_last_update_utc'), 'rates': rates}


def convert(price, currency, fx, to):
    return round(price / fx['rates'][currency] * fx['rates'][to], 2)


def unmatched(plans, items):
    """Item names no plan or NOT_PLANS pattern covers, e.g. a renamed or newly launched tier."""
    return {i['name'] for i in items
            if not any(re.search(p['name'], i['name']) for p in plans)
            and not any(re.search(x, i['name']) for x in NOT_PLANS)}


def collect(fetch_page=fetch, fx=None, pause=time.sleep, progress=None):
    fx = fx or fx_rates()
    prices, failures, unknown = [], [], {}
    for app in APPS:
        plans = [p for p in PLANS if p['app'] == app['id']]
        for region in REGIONS:
            url = store_url(app, region)
            try:
                final_url, html = fetch_page(url, {'x-apple-store-front': region['storefront'] + ',29'})
                items = parse_add_ons(html, app, region, final_url)
            except Exception as error:  # one failed page must not drop the other regions
                failures.append({'app': app['id'], 'region': region['code'], 'error': str(error)[:200]})
                if progress:
                    progress(app['id'], region['code'], 'failed')
                continue
            for name in unmatched(plans, items):
                unknown.setdefault(app['id'], {}).setdefault(name, []).append(region['code'])
            for plan in plans:
                status, item, candidates = match_plan(plan, items)
                row = {'app': app['id'], 'plan': plan['id'], 'region': region['code'], 'status': status, 'source_url': url}
                if item:
                    row.update({'price': item['price'], 'currency': region['currency'], 'display_price': item['display_price'],
                                'cny': convert(item['price'], region['currency'], fx, 'CNY'),
                                'usd': convert(item['price'], region['currency'], fx, 'USD'), 'offer': item['offer']})
                elif candidates:
                    row['candidates'] = [{'name': c['name'], 'display_price': c['display_price'], 'offer': c['offer']} for c in candidates]
                prices.append(row)
            if progress:
                progress(app['id'], region['code'], 'ok')
            pause(1)
    return {
        'schema_version': 1,
        'collected_at': now(),
        'source': 'App Store 公开商品页的应用内购买价格',
        'fx': fx,
        'apps': [{k: a[k] for k in ('id', 'name', 'provider', 'app_store_id')} for a in APPS],
        'plans': [{k: p[k] for k in ('app', 'id', 'label', 'period')} for p in PLANS],
        'regions': [{k: r[k] for k in ('code', 'name', 'currency')} for r in REGIONS],
        'prices': prices,
        'failures': failures,
        'unmatched': unknown,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    result = collect(progress=lambda app, region, status: print(f'{app}/{region}: {status}', file=sys.stderr, flush=True))
    ok = sum(p['status'] == 'ok' for p in result['prices'])
    print(f"{ok}/{len(result['prices'])} 个价格匹配成功，{len(result['failures'])} 个页面失败", file=sys.stderr)
    for app, names in result['unmatched'].items():
        for name, regions in sorted(names.items()):
            print(f'注意：{app} 出现未收录的内购项目「{name}」（{",".join(regions)}），可能是新套餐，需更新 PLANS', file=sys.stderr)
    if not ok:
        sys.exit('没有取得任何价格，保留原文件不变')
    if not args.dry_run:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temp = args.output.with_suffix('.tmp')
        temp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        temp.replace(args.output)
        print(f'已写入 {args.output.relative_to(ROOT)}', file=sys.stderr)


if __name__ == '__main__':
    main()
