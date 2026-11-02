#!/usr/bin/env python3
"""Collect allowlisted, publicly visible 16688 storefront data. Python stdlib only."""
import argparse
import hashlib
import html
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://www.16688.com.cn'
CLASSIFICATION_METHOD = '首次由 AI 阅读详情审核，后续沿用店铺与商品 ID 对应的分类；关键标题属性变化时暂停比价，不自动调用 AI'
from collector.paths import SEEDS, SNAPSHOT, DATABASE, STATE_DIR
from collector.sources import SHOP_CAPACITY, ClosedShop, source_url

def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')

def plain(value):
    # Never execute or expose merchant HTML as markup.
    text = re.sub(r'<(?:script|style)\b[^>]*>.*?</(?:script|style)>', '', str(value or ''), flags=re.I | re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', text))).strip()

def fingerprint(item):
    return hashlib.sha256((plain(item.get('name')) + '\n' + plain(item.get('description'))).encode()).hexdigest()

def mapping_key(config, shop_id, goods_id):
    composite=shop_id+':'+goods_id
    if composite in config['mappings'] or goods_id.startswith('N'):
        return composite
    return goods_id

def inventory(item):
    qty = item.get('stock_available_quantity')
    status = item.get('stock_available_status')
    if isinstance(qty, bool) or not isinstance(qty, (int, float)) or not math.isfinite(qty) or qty < 0:
        if qty is None and status=='in_stock':return 'in_stock',None
        return ('out' if status == 'out' else 'unknown'), None
    if status == 'out' and qty > 0:
        return 'unknown', None
    if qty == 0:
        return 'out', 0
    return 'in_stock', int(qty)

def api(endpoint, payload):
    request = Request(ORIGIN + '/shopApi/' + endpoint,
                      data=json.dumps(payload).encode(),
                      headers={'Content-Type': 'application/json', 'Accept': 'application/json',
                               'User-Agent': 'AI-Bijia-Research/1.0 (public storefront collection)'})
    with urlopen(request, timeout=25) as response:
        result = json.load(response)
    if not isinstance(result, dict) or result.get('code') != 1 or not isinstance(result.get('data'), dict):
        message = str(result.get('msg', 'invalid response'))[:160]
        if endpoint == 'shop/detail' and message in ('店铺不存在', '店铺链接不存在', '店铺已关闭', '店铺已注销'):
            raise ClosedShop(message)
        raise ValueError('Source returned no successful data: ' + message)
    return result['data']

def normalize(item, shop, mapping, checked_at, *, reuse_classification=False, reviewed_title=None):
    if item.get('shop_no') != shop['id'] or (reuse_classification and mapping.get('shop_id') != shop['id']):
        raise ValueError('商品与首次分类的店铺身份不匹配')
    if not plain(item.get('name')):
        raise ValueError('商品标题为空，不能更新报价')
    goods_id = item.get('goods_no')
    if not isinstance(goods_id, str) or not re.fullmatch(r'(?:G\d+|[WC][A-Za-z0-9_]+|N\d+(?:V\d+)?)', goods_id):
        raise ValueError('invalid goods ID')
    price = item.get('price')
    if isinstance(price, bool) or not isinstance(price, (int, float)) or not math.isfinite(price) or price <= 0:
        raise ValueError('invalid price')
    if reuse_classification:
        from collector.classification_policy import title_change_reason
        if not reviewed_title and fingerprint(item) != mapping['accepted_fingerprint']:
            raise ValueError('缺少首次分类的商品标题，需要先完成首次审核')
        reason = title_change_reason(reviewed_title or item.get('name'), item.get('name'))
        if reason:
            raise ValueError(reason)
    elif fingerprint(item) != mapping['accepted_fingerprint']:
        raise ValueError('商品标题或说明变化，需要重新审核规格')
    status, qty = inventory(item)
    text = plain(item.get('description'))
    delays = re.findall(r'[^。！？]{0,30}(?:需要等|限购|暂停|暂时无法|暂不能)[^。！？]{0,90}', text)
    delay = '；'.join(delays)[:220]
    availability = 'delayed' if delay else ('ready' if status == 'in_stock' else 'unknown')
    if item.get('hide_stock_count') and status == 'in_stock':
        qty = None
    platform=shop.get('platform','16688')
    origin = shop['origin'] if platform=='acg' else 'https://catfk.com' if platform=='catfk' else 'https://wzyp.cn' if platform=='wzyp' else ORIGIN
    item_path = item.get('source_path') or ('/item/' + goods_id[1:] if platform in ('wzyp','catfk','acg') else '/goods/' + goods_id)
    if not re.fullmatch(r'/(?:item/[A-Za-z0-9_]+|goods/G\d+|products/(?:[A-Za-z0-9_-]|%[0-9A-Fa-f]{2})+)', item_path):
        raise ValueError('商品来源路径无效')
    return {'id': shop['id'] + ':' + goods_id, 'source_goods_id': goods_id,
            'shop_id': shop['id'], 'sku': mapping['sku'], 'item_name': plain(item.get('name')),
            'price': round(price, 2), 'currency': 'CNY', 'price_basis': 'shelf_single_unit',
            'fees': 'unverified', 'stock_status': status, 'stock_count': qty,
            'availability': availability, 'availability_note': delay.strip() if delay else mapping.get('restriction', ''),
            'warranty': mapping['warranty'], 'channel': mapping['channel'],
            'item_url': origin + item_path, 'checked_at': checked_at,
            'collection_status': 'ok', 'source': shop.get('platform', '16688') + ' public storefront API',
            'spec_evidence': mapping['spec_evidence'], 'listing_status': 'listed',
            'classified_item_name': plain(reviewed_title or item.get('name')),
            'classification_mode': 'initial_once',
            **({'inventory_checked_at': shop.get('checked_at', checked_at)} if shop.get('platform') in ('wzyp', 'catfk') else {})}

def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    os.replace(temp, path)

def database(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.execute('CREATE TABLE IF NOT EXISTS snapshots (at TEXT PRIMARY KEY, snapshot TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS observations (run_at TEXT, quote_id TEXT, checked_at TEXT, price REAL, stock TEXT, PRIMARY KEY(run_at, quote_id))')
    return db

def retire_unlisted(config, snapshot):
    """Disable item monitoring only after a successful, complete shelf proves absence.

    Retain mappings and dated quote history for audit/manual re-review. Temporary
    failures, incomplete shelves, expired observations and sold-out items stay monitored.
    """
    shops = {s['id']: s for s in snapshot.get('shops', [])}
    retired = {}
    for q in snapshot.get('quotes', []):
        shop = shops.get(q['shop_id'], {})
        if (q.get('collection_status') != 'not_listed' or
                q.get('listing_status') != 'not_listed' or
                shop.get('collection_status') != 'ok' or
                shop.get('listing_complete') is not True or
                not q.get('attempted_at') or
                q['id'] in config.get('exclusions', {})):
            continue
        retired[q['id']] = {
            'reason': '完整原店货架已确认下架，停用商品监控',
            'confirmed_at': q['attempted_at'],
            'disabled_at': now(),
            'item_url': q.get('item_url'),
            'shop_id': q['shop_id'],
            'source_goods_id': q['source_goods_id'],
        }
    if retired:
        config.setdefault('exclusions', {}).update(retired)
    return retired

def collect(config, previous, fetch=api, pause=time.sleep, staged_storefront=None, progress=None, capture_dir=None, checkpoint=None):
    if len(config['shops']) > min(config.get('shop_limit', SHOP_CAPACITY), SHOP_CAPACITY):
        raise ValueError('店铺数量超过配置上限')
    from collector.classification_policy import reviewed_titles
    titles = reviewed_titles(config, previous)
    at = now()
    old_quotes = {q['id']: q for q in previous.get('quotes', [])
                  if q['id'] not in config.get('exclusions', {})}
    old_shops = {s['id']: s for s in previous.get('shops', [])}
    quotes, shops, reviews, logs = [], [], [], []
    if checkpoint and checkpoint.state:
        state = checkpoint.state
        at = state['run_started_at']
        shops, quotes, reviews, logs = state['shops'], state['quotes'], state['reviews'], state['logs']
        closed = {s['id']: s for s in state['closed_shops']}
        for seed in config['shops']:
            if seed['id'] in closed:
                seed.update(closed[seed['id']])
        if progress:
            progress({'resumed': len(shops), 'total': len(config['shops']), 'run_started_at': at})

    def saved():
        if checkpoint:
            checkpoint.save(at, shops, quotes, reviews, logs, config)

    for seed in config['shops'][len(shops):]:
        platform = seed.get('platform', '16688')
        shop_url = source_url(seed)
        shop = {**seed, 'platform': platform, 'url': shop_url}
        if seed.get('enabled') is False or seed.get('disabled_at') or seed.get('collection_paused'):
            shop = {**old_shops.get(seed['id'], {}), **shop, 'enabled': False if seed.get('disabled_at') else seed.get('enabled', True), 'collection_status': 'disabled' if seed.get('disabled_at') else 'failed', 'attempted_at': now(), 'error': seed.get('disabled_reason') or seed.get('pause_reason') or '已停用采集'}
            shops.append(shop)
            quotes.extend({**q, 'collection_status': 'failed', 'collection_error': '店铺已停用采集', 'attempted_at': now()} for q in old_quotes.values() if q['shop_id'] == seed['id'])
            logs.append({'shop_id': seed['id'], 'status': shop['collection_status'], 'attempted_at': now(), 'error': shop['error']})
            saved()
            if progress: progress({'completed': len(shops), 'total': len(config['shops']), **logs[-1]})
            continue
        try:
            if platform == 'catfk':
                from collector import catfk
                detail, items = catfk.storefront(seed)
            elif platform == 'wzyp':
                from collector import wzyp
                detail, items = staged_storefront(seed) if staged_storefront else wzyp.storefront(seed)
            elif platform == 'independent':
                from collector import independent
                detail, items = independent.storefront(seed)
            elif platform == 'acg':
                from collector import acg
                detail, items = acg.storefront(seed)
            elif platform == '16688':
                detail = fetch('shop/detail', {'shop_no': seed['id']})
                listing = fetch('goods/list', {'shop_no': seed['id'], 'goods_category_no': '', 'keywords': '', 'sort': 'default'})
                if not isinstance(listing.get('list'), list) or (listing.get('total') is not None and listing['total'] > len(listing['list'])):
                    raise ValueError('商品列表格式异常或不完整')
                items = listing['list']
            else:
                raise ValueError('Unsupported platform')
            if detail.get('shop_no') != seed['id'] or not plain(detail.get('name')):
                raise ValueError('店铺身份不匹配')
            shop.update(name=plain(detail['name']), region=plain(detail.get('merchant', {}).get('region')),
                        checked_at=now(), collection_status='ok', source_item_count=len(items),
                        fee_note='货架标价；平台手续费与结算总价尚未核验')
            shop['listing_complete']=detail.get('listing_complete',True)
            seen = set()
            for item in items:
                gid = item.get('goods_no', '')
                if gid in seen:
                    raise ValueError('商品列表包含重复 ID')
                seen.add(gid)
            if capture_dir:
                atomic_json(capture_dir/(seed['id']+'.json'), {'seed':seed,'info':detail,'items':items,'checked_at':shop['checked_at']})
            local_quotes, local_reviews = [], []
            for item in items:
                gid = item.get('goods_no', '')
                if seed['id'] + ':' + gid in config.get('exclusions', {}):
                    continue
                mapping = config['mappings'].get(mapping_key(config,seed['id'],gid))
                if not mapping or mapping['shop_id'] != seed['id']:
                    local_reviews.append({'shop_id': seed['id'], 'goods_id': gid, 'name': plain(item.get('name')), 'reason': '标价为占位或需补差价，不参与比价' if '补差价' in plain(item.get('name')) else '未审核规格，不参与比价'})
                    continue
                try:
                    if platform=='catfk':product=catfk.detail(seed,item)
                    elif platform=='acg':product=acg.detail(seed,item)
                    else:product = wzyp.detail(seed, item) if platform == 'wzyp' else fetch('goods/detail', {'goods_no': gid})
                    if product.get('shop_no') != seed['id'] or product.get('goods_no') != gid:
                        raise ValueError('商品详情身份不匹配')
                    if capture_dir:
                        from collector.review import draft
                        observation={'raw':product,'checked_at':now(),'inventory_checked_at':shop['checked_at'] if platform in ('wzyp','catfk') else now()}
                        atomic_json(capture_dir/(seed['id']+'--'+gid+'.json'),draft(config,seed,gid,observation))
                    local_quotes.append(normalize(product, shop, mapping, now(), reuse_classification=True,
                                                  reviewed_title=titles.get(seed['id'] + ':' + gid)))
                except Exception as exc:
                    local_reviews.append({'shop_id': seed['id'], 'goods_id': gid, 'name': plain(item.get('name')), 'reason': str(exc)[:180]})
                    old = old_quotes.get(seed['id'] + ':' + gid)
                    # Preserve the last successful observation, but exclude unverified records from current minima.
                    if old:
                        local_quotes.append({**old, 'collection_status': 'needs_review', 'collection_error': str(exc)[:180], 'attempted_at': now()})
                pause(.25)
            # A successful full-list response confirms absence from the storefront, not deletion from the platform.
            for q in old_quotes.values():
                if q['shop_id'] == seed['id'] and q['source_goods_id'] not in seen:
                    local_quotes.append({**q, 'listing_status': 'not_listed', 'collection_status': 'not_listed', 'attempted_at': now()} if shop['listing_complete'] else {**q,'collection_status':'needs_review','collection_error':'公开列表可见范围不足，需单独复核','attempted_at':now()})
            quotes.extend(local_quotes)
            reviews.extend(local_reviews)
            logs.append({'shop_id': seed['id'], 'status': 'ok', 'attempted_at': now(), 'source_items': len(items), 'quotes': len(local_quotes), 'review_items': len(local_reviews)})
        except Exception as exc:
            if isinstance(exc, ClosedShop):
                seed.update(enabled=False, disabled_at=now(), disabled_reason=str(exc), closure_evidence={'url': shop_url, 'confirmed_at': now(), 'response': str(exc)})
                shop.update(seed)
            shop = {**old_shops.get(seed['id'], {}), **shop, 'collection_status': 'disabled' if isinstance(exc, ClosedShop) else 'failed', 'attempted_at': now(), 'error': str(exc)[:180]}
            quotes.extend({**q, 'collection_status': 'failed', 'attempted_at': now(), 'collection_error': str(exc)[:180]} for q in old_quotes.values() if q['shop_id'] == seed['id'])
            logs.append({'shop_id': seed['id'], 'status': 'failed', 'attempted_at': now(), 'error': str(exc)[:180]})
        shops.append(shop)
        saved()
        if progress:
            progress({'completed':len(shops),'total':len(config['shops']),**logs[-1]})
        pause(.5)
    current = [q for q in quotes if q['collection_status'] == 'ok' and q['listing_status'] == 'listed']
    ready = [q for q in current if q['stock_status'] == 'in_stock' and q['availability'] == 'ready']
    return {'schema_version': 1, 'generated_at': now(), 'run_started_at': at, 'mode': 'source_snapshot',
            'products': config['products'], 'shops': shops, 'quotes': quotes, 'collection_log': logs,
            'review_items': reviews,
            'stats': {'shops': len(shops), 'shops_ok': sum(s['collection_status'] == 'ok' for s in shops),
                      'source_items': sum(s.get('source_item_count', 0) for s in shops if s['collection_status'] == 'ok'),
                      'quotes': len(current), 'ready_quotes': len(ready), 'review_items': len(reviews)},
            'methodology': {'pricing': '单件货架标价，非结算总价，手续费未核验',
                            'classification': CLASSIFICATION_METHOD,
                            'availability': '库存来自公开接口；说明中的限购或延期单独提示，不计入可立即使用最低价',
                            'updates': '手动运行采集脚本后发布快照；尚未配置无人值守定时更新'}}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, default=SEEDS)
    parser.add_argument('--output', type=Path, default=SNAPSHOT)
    parser.add_argument('--db', type=Path, default=DATABASE)
    parser.add_argument('--captures', type=Path, help='Save source shelves and detail review drafts locally; does not approve changed goods')
    parser.add_argument('--checkpoint', type=Path, default=STATE_DIR / 'collect-checkpoint.json')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--resume', action='store_true', help='Continue from completed shops with original observation times')
    mode.add_argument('--restart', action='store_true', help='Discard an unfinished checkpoint and collect all shops again')
    args = parser.parse_args()
    # A process lock is released by the OS even after SIGKILL; stale lock files are harmless.
    import fcntl
    args.checkpoint.parent.mkdir(parents=True, exist_ok=True)
    with args.checkpoint.with_suffix('.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('已有采集进程运行，请勿重复启动')
        config = json.loads(args.config.read_text())
        previous = json.loads(args.output.read_text()) if args.output.exists() else {}
        from collector.checkpoint import Checkpoint
        checkpoint = Checkpoint(args.checkpoint, config, previous, args.resume, args.restart)
        snapshot = collect(config, previous, checkpoint=checkpoint, capture_dir=args.captures, progress=lambda entry: print(json.dumps(entry, ensure_ascii=False), file=sys.stderr, flush=True))
        retired = retire_unlisted(config, snapshot)
        if retired or any(s.get('disabled_at') for s in config['shops']):
            atomic_json(args.config, config)
        with database(args.db) as db:
            for q in snapshot['quotes']:
                if q['collection_status'] == 'ok':
                    db.execute('INSERT OR IGNORE INTO observations VALUES (?,?,?,?,?)', (snapshot['generated_at'], q['id'], q['checked_at'], q['price'], q['stock_status']))
            history = []
            # Only compare successfully observed ready, in-stock quotes with their own earlier observations.
            for q in snapshot['quotes']:
                if q['collection_status'] != 'ok' or q['stock_status'] != 'in_stock' or q['availability'] != 'ready':
                    continue
                before = db.execute('SELECT price, checked_at FROM observations WHERE quote_id=? AND run_at<? ORDER BY run_at DESC LIMIT 1', (q['id'], snapshot['generated_at'])).fetchone()
                if before and before[0] != q['price']:
                    history.append({'sku': q['sku'], 'shop_id': q['shop_id'], 'from': before[0], 'to': q['price'], 'previous_at': before[1], 'checked_at': q['checked_at'], 'item_url': q['item_url']})
            snapshot['changes'] = history
            db.execute('INSERT OR REPLACE INTO snapshots VALUES (?,?)', (snapshot['generated_at'], json.dumps(snapshot, ensure_ascii=False)))
        atomic_json(args.output, snapshot)
        checkpoint.finish()
        print(json.dumps({'generated_at': snapshot['generated_at'], **snapshot['stats'], 'price_changes': len(snapshot['changes']), 'retired_monitors': len(retired)}, ensure_ascii=False))
        return 0 if snapshot['stats']['shops_ok'] else 2
if __name__ == '__main__':
    raise SystemExit(main())
