"""Resume a source-verified shop expansion; directory data supplies URLs only."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from collector.paths import SEEDS, SNAPSHOT, DATABASE, RUNTIME_DIR
from collector.collect import ROOT, api, atomic_json, collect, database, now
from collector.sources import SHOP_CAPACITY, directory_url


def candidates(config, directory):
    known = {s['id'] for s in config['shops']}
    origins = {s.get('origin') for s in config['shops']} | {'https://nikoers.com'}
    rows = []
    for lead in directory['shops_index']:
        resolved = directory_url(lead, lambda token: api('shop/detail', {'shop_no': token}).get('shop_no'))
        if not resolved:
            continue
        u = urlsplit(resolved)
        if u.scheme != 'https' or not u.hostname or u.username or u.password or u.port:
            continue
        token = u.path.rstrip('/').split('/')[-1]
        if u.hostname in ('wzyp.cn', 'catfk.com') and re.fullmatch(r'[A-Za-z0-9_-]+', token):
            platform = 'wzyp' if u.hostname == 'wzyp.cn' else 'catfk'
            seed = {'id': ('W_' if platform == 'wzyp' else 'C_') + token, 'platform': platform, 'source_token': token}
        elif u.hostname in ('www.16688.com.cn', '16688.com.cn') and re.fullmatch(r'S\d+', token):
            seed = {'id': token}
        elif u.hostname not in ('shuita.xyz', 'catfk.com'):
            origin = 'https://' + u.hostname
            if origin in origins:
                continue
            seed = {'id': 'A_' + re.sub(r'[^a-z0-9]', '_', u.hostname), 'platform': 'acg',
                    'origin': origin, 'name': lead.get('name', u.hostname)}
            if lead.get('platform') in ('cardnet', 'dujiao_next'):
                seed['adapter'] = 'dujiao_next'
            elif lead.get('platform') == 'jsonld':
                seed['adapter'] = 'jsonld'
        else:
            continue
        if seed['id'] not in known:
            rows.append({**seed, 'name': seed.get('name') or lead.get('name') or seed['id'], 'discovered_from': lead.get('discovered_from', 'user-provided'),
                         'discovery_note': '公开目录仅发现链接；货架直接采集原店，未审核商品不参与比价'})
            known.add(seed['id'])
    return sorted(rows, key=lambda s: s.get('platform') == 'acg')


def merge(previous, fresh, config):
    result = {**previous, 'generated_at': fresh['generated_at'], 'products': config['products']}
    for key in ('shops', 'quotes', 'review_items', 'collection_log'):
        result[key] = previous.get(key, []) + fresh.get(key, [])
    active = [q for q in result['quotes'] if q['collection_status'] == 'ok' and q['listing_status'] == 'listed']
    result['stats'] = {'shops': len(result['shops']),
        'shops_ok': sum(s['collection_status'] == 'ok' for s in result['shops']),
        'source_items': sum(s.get('source_item_count', 0) for s in result['shops'] if s['collection_status'] == 'ok'),
        'quotes': len(active), 'ready_quotes': sum(q['stock_status'] == 'in_stock' and q['availability'] == 'ready' for q in active),
        'review_items': len(result['review_items'])}
    result['methodology']['updates'] = '分阶段采集；逐店与逐报价保留实际核验时间，未配置无人值守定时更新'
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory', type=Path, required=True)
    p.add_argument('--limit', type=int, default=146)
    p.add_argument('--state', type=Path, default=RUNTIME_DIR / 'expansion/progress.json')
    a = p.parse_args()
    cp, sp = SEEDS, SNAPSHOT
    config, snapshot = json.loads(cp.read_text()), json.loads(sp.read_text())
    if a.limit < len(config['shops']) or a.limit > SHOP_CAPACITY:
        p.error('Expansion limit must preserve existing shops and cannot exceed database capacity 200')
    if {s['id'] for s in config['shops']} != {s['id'] for s in snapshot['shops']}:
        p.error('Configuration and snapshot shops differ; resolve before expanding')
    config['shop_limit'] = a.limit
    atomic_json(cp, config)
    progress = json.loads(a.state.read_text()) if a.state.exists() else {'attempts': []}
    attempted = {s['shop_id'] for s in progress['attempts']}
    for seed in candidates(config, json.loads(a.directory.read_text())):
        if len(config['shops']) >= a.limit:
            break
        if seed['id'] in attempted:
            continue
        fresh = collect({**config, 'shops': [seed]}, {}, capture_dir=a.state.parent/'captures')
        shop = fresh['shops'][0]
        entry = {'shop_id': seed['id'], 'status': shop['collection_status'], 'attempted_at': now(),
                 'source_items': shop.get('source_item_count', 0), 'error': shop.get('error')}
        config['shops'].append(seed)
        snapshot = merge(snapshot, fresh, config)
        atomic_json(cp, config)
        atomic_json(sp, snapshot)
        with database(DATABASE) as db:
            db.execute('INSERT OR REPLACE INTO snapshots VALUES (?,?)', (snapshot['generated_at'], json.dumps(snapshot, ensure_ascii=False)))
        progress['attempts'].append(entry)
        progress.update(updated_at=now(), target=a.limit, collected=len(config['shops']))
        atomic_json(a.state, progress)
        print(json.dumps({**entry, 'collected': len(config['shops']), 'target': a.limit}, ensure_ascii=False), flush=True)
    print(json.dumps(snapshot['stats'], ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
