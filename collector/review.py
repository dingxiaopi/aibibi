"""Local spec review: inspect a real detail, then reverify before approving.

No title guessing and no purchases. Approval requires a completed review JSON.
The exported mapping update uses compare-and-set against the prior fingerprint.
"""
import argparse
import json
from pathlib import Path
from collector.paths import SEEDS, SNAPSHOT, DATABASE, RUNTIME_DIR
from collector.collect import ROOT, CLASSIFICATION_METHOD, api, atomic_json, database, fingerprint, mapping_key, normalize, now, plain

FIELDS = ('sku', 'channel', 'warranty', 'spec_evidence', 'restriction')

def observe(seed, gid):
    platform = seed.get('platform', '16688')
    if platform == 'wzyp':
        from collector import wzyp
        info, items = wzyp.storefront(seed)
        inventory_at = now()
        item = next((i for i in items if i['goods_no'] == gid), None)
        if not item:
            raise ValueError('商品已不在完整货架列表中')
        raw = wzyp.detail(seed, item)
    elif platform == '16688':
        listing = api('goods/list', {'shop_no': seed['id'], 'goods_category_no': '', 'keywords': '', 'sort': 'default'})
        if not isinstance(listing.get('list'), list) or (listing.get('total') is not None and listing['total'] > len(listing['list'])):
            raise ValueError('商品列表不完整')
        if not any(i.get('goods_no') == gid for i in listing['list']):
            raise ValueError('商品已不在完整货架列表中')
        raw = api('goods/detail', {'goods_no': gid})
        inventory_at = now()
    elif platform=='catfk':
        from collector import catfk
        _,items=catfk.storefront(seed); inventory_at=now()
        item=next((i for i in items if i['goods_no']==gid),None)
        if not item:raise ValueError('商品已不在完整货架列表中')
        raw=catfk.detail(seed,item)
    elif platform=='acg':
        from collector import acg
        _,items=acg.storefront(seed); inventory_at=now()
        item=next((i for i in items if i['goods_no']==gid),None)
        if not item:raise ValueError('商品已不在完整货架列表中')
        raw=acg.detail(seed,item)
    else:
        raise ValueError('独立站目前仅收录目录，不批准占位或补差价报价')
    if raw.get('goods_no') != gid or raw.get('shop_no') != seed['id']:
        raise ValueError('商品详情身份不匹配')
    return {'raw': raw, 'checked_at': now(), 'inventory_checked_at': inventory_at}

def draft(config, seed, gid, observation):
    old = config['mappings'].get(mapping_key(config,seed['id'],gid))
    if old and old['shop_id'] != seed['id']:
        raise ValueError('商品ID已有其他店铺映射')
    raw = observation['raw']
    return {**observation, 'shop_id': seed['id'], 'goods_id': gid,
            'fingerprint': fingerprint(raw), 'previous_fingerprint': old['accepted_fingerprint'] if old else None,
            'mapping': {key: (old or {}).get(key, '') for key in FIELDS},
            'review_note': '完整阅读 raw.name / raw.description 后填写 mapping；approve 会重新请求源站核对说明和库存'}

def approve(config, snapshot, review, observer=observe):
    seed = next(s for s in config['shops'] if s['id'] == review['shop_id'])
    gid = review['goods_id']
    fields = review['mapping']
    if not all(isinstance(fields.get(k), str) and 0 < len(fields[k].strip()) <= 1000 for k in FIELDS):
        raise ValueError('必须填写规格、渠道、售后、归类依据和账号条件')
    if fields['sku'] not in {p['id'] for p in config['products']}:
        raise ValueError('未知规格；需先定义规格，不能猜测归类')
    if fields['sku'].startswith(('apple-id-', 'free-account-', 'muse-token-', 'team5x-')):
        raise ValueError('收录规则排除该规格，不批准新的商品映射')
    key=mapping_key(config,seed['id'],gid)
    old = config['mappings'].get(key)
    if (old['accepted_fingerprint'] if old else None) != review['previous_fingerprint']:
        raise ValueError('本地映射已改变，请重新 inspect')
    observed = observer(seed, gid)
    raw = observed['raw']
    if fingerprint(review['raw']) != review['fingerprint'] or fingerprint(raw) != review['fingerprint']:
        raise ValueError('商品说明在审核期间变化，请重新 inspect 并阅读，未保存映射')
    from collector.subscription_terms import has_month_evidence
    product = next(p for p in config['products'] if p['id'] == fields['sku'])
    if not has_month_evidence(raw, product):
        raise ValueError('收录规则排除：月度规格缺少实际订阅时长依据，质保或账号年龄不能作为订阅时长')
    if '补差价' in plain(raw.get('name')):
        raise ValueError('补差价占位商品不得参与比价')
    mapping = {**fields, 'shop_id': seed['id'], 'accepted_fingerprint': review['fingerprint'],
               'classified_item_name': plain(raw.get('name')), 'classified_at': now()}
    shop = next((s for s in snapshot['shops'] if s['id'] == seed['id']), {**seed, 'platform': seed.get('platform','16688')})
    quote = normalize(raw, {**shop, 'checked_at': observed['inventory_checked_at']}, mapping, observed['checked_at'])
    update = {'shop_id': seed['id'], 'goods_id': gid, 'previous_fingerprint': review['previous_fingerprint'],
              'reviewed_at': now(), 'mapping': mapping,
              'raw': {k: raw.get(k, '') for k in ('goods_no', 'shop_no', 'name', 'description', 'source_path')}}
    # Keep the original server precondition if several local reviews precede a push.
    updates = config.get('mapping_updates', [])
    prior_update = next((u for u in updates if u['shop_id'] == seed['id'] and u['goods_id'] == gid), None)
    acknowledged = config.get('mapping_acknowledgements', {}).get(seed['id']+':'+gid, {})
    if prior_update and acknowledged.get('fingerprint') != (old or {}).get('accepted_fingerprint'):
        update['previous_fingerprint'] = prior_update['previous_fingerprint']
    new_config = {**config, 'mappings': {**config['mappings'], key: mapping},
                  'exclusions': {k:v for k,v in config.get('exclusions',{}).items() if k != seed['id']+':'+gid},
                  'mapping_updates': [u for u in updates if (u['shop_id'],u['goods_id']) != (seed['id'],gid)] + [update]}
    new_snapshot = {**snapshot, 'generated_at': now(),
                    'methodology': {**snapshot.get('methodology', {}), 'classification': CLASSIFICATION_METHOD},
                    'quotes': [q for q in snapshot['quotes'] if q['id'] != quote['id']] + [quote],
                    'review_items': [r for r in snapshot['review_items'] if (r['shop_id'],r['goods_id']) != (seed['id'],gid)]}
    active = [q for q in new_snapshot['quotes'] if q['collection_status'] == 'ok' and q['listing_status'] == 'listed']
    new_snapshot['stats'] = {**snapshot.get('stats', {}), 'quotes': len(active),
                             'ready_quotes': sum(q['stock_status']=='in_stock' and q['availability']=='ready' for q in active),
                             'review_items': len(new_snapshot['review_items'])}
    return new_config, new_snapshot, quote

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--config', type=Path, default=SEEDS)
    p.add_argument('--snapshot', type=Path, default=SNAPSHOT)
    sub = p.add_subparsers(dest='command', required=True)
    listing = sub.add_parser('list'); listing.add_argument('--shop')
    inspection = sub.add_parser('inspect'); inspection.add_argument('shop_id'); inspection.add_argument('goods_id')
    approval = sub.add_parser('approve'); approval.add_argument('file', type=Path)
    a = p.parse_args()
    config = json.loads(a.config.read_text()); snapshot = json.loads(a.snapshot.read_text())
    if a.command == 'list':
        for item in snapshot['review_items']:
            if not a.shop or item['shop_id'] == a.shop:
                print(json.dumps(item, ensure_ascii=False))
    elif a.command == 'inspect':
        seed = next(s for s in config['shops'] if s['id'] == a.shop_id)
        result = draft(config, seed, a.goods_id, observe(seed,a.goods_id))
        dest = RUNTIME_DIR / 'reviews'/f'{a.shop_id}--{a.goods_id}.json'
        atomic_json(dest, result)
        print(json.dumps({'file': str(dest), 'name': plain(result['raw'].get('name')), 'fingerprint': result['fingerprint']},ensure_ascii=False))
    elif a.command == 'approve':
        review = json.loads(a.file.read_text())
        updated, result, quote = approve(config,snapshot,review)
        with database(DATABASE) as db:
            db.execute('INSERT OR IGNORE INTO observations VALUES (?,?,?,?,?)', (result['generated_at'],quote['id'],quote['checked_at'],quote['price'],quote['stock_status']))
        atomic_json(a.config,updated); atomic_json(a.snapshot,result)
        print(json.dumps({'approved':quote['id'],'sku':quote['sku'],'checked_at':quote['checked_at'],'stock_status':quote['stock_status'],'next':'npm run export:local && npm run push:local (in cloudflare)'},ensure_ascii=False))

if __name__ == '__main__':
    main()
