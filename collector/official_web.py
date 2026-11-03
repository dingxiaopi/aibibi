"""Official web subscription sources. No competitor data or inferred plan prices."""
import json
import math
import re
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.parse import urljoin


OPENAI_URL = 'https://chatgpt.com/backend-api/checkout_pricing_config/configs/'
GOOGLE_ORIGIN = 'https://one.google.com'
GOOGLE_PAGE = GOOGLE_ORIGIN + '/intl/ALL_us/about/'
OPENAI_PLANS = {'go-month': 'go', 'plus-month': 'plus', 'pro100-month': 'prolite',
                'pro200-month': 'pro', 'pro500-month': 'promax'}
GOOGLE_PLANS = {'plus-month': 'PRICE_GEN_AI_PLUS_MONTHLY', 'pro-month': 'PRICE_GEN_AI_PRO_MONTHLY',
                'ultra5-month': 'PRICE_GEN_AI_ULTRA_100_MONTHLY',
                'ultra20-month': 'PRICE_GEN_AI_ULTRA_200_MONTHLY'}


def amount(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        raise ValueError('官方价格必须是正的有限数字')
    return round(value, 2)


def currency_code(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Z]{3}', value):
        raise ValueError('官方响应没有明确的 ISO 币种')
    return value


def parse_openai(data, region):
    if data.get('country_code', '').lower() != region['code']:
        raise ValueError('OpenAI 返回的地区不匹配')
    config = data['currency_config']
    currency = currency_code(config.get('symbol_code'))
    rows = []
    for plan, key in OPENAI_PLANS.items():
        item = config.get(key, {}).get('month')
        if not item:
            continue
        tax = item.get('tax', 'unknown')
        row = {'plan': plan, 'price': amount(item['amount']), 'currency': currency,
               'tax': tax if tax in ('inclusive', 'exclusive') else 'unknown'}
        override = item.get('psp_override', {})
        if tax == 'inclusive' and override.get('tax') == 'exclusive':
            row['pretax_price'] = amount(override['amount'])
        percent = config.get('tax_percent')
        if isinstance(percent, (int, float)) and not isinstance(percent, bool) and math.isfinite(percent) and 0 <= percent <= 100:
            row['tax_percent'] = percent
        rows.append(row)
    if not rows:
        raise ValueError('OpenAI 没有可核验的月付套餐')
    # The API's year amounts may be monthly equivalents; never multiply or map them without billing evidence.
    return rows


def parse_google(data, region):
    if str(data.get('COUNTRY_CODE', '')).lower() not in {region['code'], 'uk' if region['code'] == 'gb' else region['code']}:
        raise ValueError('Google 返回的地区不匹配')
    currency = currency_code(data.get('CURRENCY_CODE'))
    rows = [{'plan': plan, 'price': amount(data[key]), 'tax': 'unknown', 'currency': currency}
            for plan, key in GOOGLE_PLANS.items() if data.get(key) is not None]
    if not rows:
        raise ValueError('Google 没有可核验的 AI 月付套餐')
    return rows


def discover_google_feed(fetch_page):
    """Discover the version from Google's current page/assets instead of pinning a dated feed."""
    final, html = fetch_page(GOOGLE_PAGE)
    if not final.startswith(GOOGLE_ORIGIN + '/'):
        raise ValueError('Google 价格页跳转到其他来源')
    pattern = r'pricing_\d{4}_\d{2}_\d{2}\.json'
    versions = re.findall(pattern, html)
    if not versions:
        scripts = list(dict.fromkeys(re.findall(r'<script[^>]+src=["\x27]([^"\x27]+)', html)))
        for script in scripts[:24]:
            url = urljoin(final, script)
            if not url.startswith(GOOGLE_ORIGIN + '/about/assets/'):
                continue
            asset_url, body = fetch_page(url)
            if not asset_url.startswith(GOOGLE_ORIGIN + '/about/assets/'):
                raise ValueError('Google 脚本跳转到其他来源')
            versions.extend(re.findall(pattern, body))
            if versions:
                break
    if not versions:
        raise ValueError('当前 Google 官方页未发现价格 JSON 版本；保留旧数据，不猜测日期')
    return max(versions)


def read_evidence(path):
    """Read direct official responses captured by a browser; retain the real observation time."""
    if not path:
        return {}
    entries = json.loads(path.read_text())
    if not isinstance(entries, list):
        raise ValueError('浏览器凭据应为官方响应数组')
    result = {}
    now = datetime.now(timezone.utc)
    for item in entries:
        url = item['source_url']
        if not re.fullmatch(re.escape(OPENAI_URL) + r'[A-Z]{2}', url):
            raise ValueError('只接受 OpenAI 官方地区价格 URL')
        observed = datetime.fromisoformat(item['observed_at'].replace('Z', '+00:00'))
        if observed.tzinfo is None or not 0 <= (now - observed).total_seconds() <= 7 * 86400:
            raise ValueError('浏览器响应必须有最近7天内的真实带时区时间')
        if url in result:
            raise ValueError('浏览器响应地区重复')
        result[url] = item
    return result


def collect_web(apps, regions, fetch_page, stamp, pause, evidence=None, progress=None, currencies=None):
    prices, failures, checked = [], [], set()
    evidence = evidence or {}
    google_version = None
    google_error = None
    openai_blocked = None
    for app in apps:
        app_id = app['id']
        if app_id not in ('chatgpt', 'gemini'):
            continue
        if app_id == 'gemini':
            try:
                google_version = discover_google_feed(fetch_page)
            except Exception as error:
                google_error = str(error)
        for region in regions:
            code = region['code']
            if app_id == 'chatgpt':
                url = OPENAI_URL + code.upper()
            else:
                locale = 'uk' if code == 'gb' else code
                url = f'{GOOGLE_ORIGIN}/intl/ALL_{locale}/about/feeds/{google_version}' if google_version else GOOGLE_PAGE
            checked.add((app_id, code, 'web'))
            try:
                captured = evidence.get(url)
                if app_id == 'gemini' and google_error:
                    raise ValueError(google_error)
                if app_id == 'chatgpt' and openai_blocked and not captured:
                    raise ValueError('本轮普通请求受限，未继续请求其他地区：' + openai_blocked)
                observed_at = captured['observed_at'] if captured else stamp
                if captured:
                    data = captured['data']
                else:
                    final, body = fetch_page(url)
                    if final != url:
                        raise ValueError('官方价格接口发生跳转，未采用其他页面')
                    data = json.loads(body)
                rows = parse_openai(data, region) if app_id == 'chatgpt' else parse_google(data, region)
                if currencies is not None and any(r['currency'] not in currencies for r in rows):
                    raise ValueError('官方计费币种缺少可用汇率，未采用地区默认币种代替')
                for row in rows:
                    prices.append({**row, 'app': app_id, 'region': code, 'channel': 'web', 'status': 'ok',
                                   'source_url': url, 'observed_at': observed_at,
                                   'attempted_at': stamp, 'stale': False,
                                   'display_price': f"{row['currency']} {row['price']:,.2f}"})
                if progress:
                    progress(app_id, code, 'web ok')
            except Exception as error:
                if isinstance(error, HTTPError) and error.code in (403, 429) and app_id == 'chatgpt':
                    openai_blocked = str(error)
                failures.append({'app': app_id, 'region': code, 'channel': 'web', 'source_url': url,
                                 'attempted_at': stamp, 'error': str(error)[:200]})
                if progress:
                    progress(app_id, code, 'web failed')
            pause(1)
    return prices, failures, checked
