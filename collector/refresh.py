"""Resume incremental source refreshes without replacing other shops' timestamps."""
import argparse
import json
from pathlib import Path
from collector.paths import SEEDS, SNAPSHOT, RUNTIME_DIR
from collector.collect import ROOT, atomic_json, collect, now, retire_unlisted


def replace_shops(previous, fresh, products):
    ids = {s['id'] for s in fresh['shops']}
    result = {**previous, 'generated_at': fresh['generated_at'], 'products': products}
    for key in ('shops', 'quotes', 'review_items', 'collection_log'):
        result[key] = [x for x in previous.get(key, []) if (x['id'] if key == 'shops' else x['shop_id']) not in ids] + fresh[key]
    current = [q for q in result['quotes'] if q['collection_status'] == 'ok' and q['listing_status'] == 'listed']
    result['stats'] = {'shops': len(result['shops']), 'shops_ok': sum(s['collection_status'] == 'ok' for s in result['shops']),
        'source_items': sum(s.get('source_item_count', 0) for s in result['shops'] if s['collection_status'] == 'ok'),
        'quotes': len(current), 'ready_quotes': sum(q['stock_status'] == 'in_stock' and q['availability'] == 'ready' for q in current),
        'review_items': len(result['review_items'])}
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('shops', nargs='+')
    p.add_argument('--captures', type=Path, default=RUNTIME_DIR / 'source-refresh')
    a = p.parse_args()
    cp, sp = SEEDS, SNAPSHOT
    config, snapshot = json.loads(cp.read_text()), json.loads(sp.read_text())
    seeds = {s['id']: s for s in config['shops']}
    for ident in a.shops:
        if ident not in seeds: p.error('Unknown shop: ' + ident)
    for ident in a.shops:
        fresh = collect({**config, 'shops': [seeds[ident]]}, snapshot, capture_dir=a.captures)
        retire_unlisted(config, fresh)
        snapshot = replace_shops(snapshot, fresh, config['products'])
        atomic_json(cp, config)
        atomic_json(sp, snapshot)
        print(json.dumps({'shop_id': ident, 'at': now(), **fresh['stats'], 'error': fresh['shops'][0].get('error')}, ensure_ascii=False), flush=True)


if __name__ == '__main__': main()
