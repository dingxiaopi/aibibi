"""Classify a shop's first captured catalog once; later products remain unclassified.

    python3 -m collector.classification --plan
    python3 -m collector.classification --shop S274389

State is local and resumable. This command never exports or pushes production data.
"""
import argparse
import json
from collections import Counter
from types import SimpleNamespace

from collector.paths import STATE_DIR
from collector import ai_review
from collector.collect import ROOT, atomic_json, mapping_key, now

STATE = STATE_DIR / 'classification-state.json'
RUN = STATE_DIR / 'classification-run.json'
TERMINAL = {'approved', 'excluded_or_unlisted', 'irrelevant', 'new_spec',
            'insufficient_information', 'price_held', 'rejected', 'needs_adapter'}


def read_state():
    state = json.loads(STATE.read_text()) if STATE.exists() else {'version': 1, 'shops': {}}
    if state.get('version') != 1 or not isinstance(state.get('shops'), dict):
        raise ValueError('首次分类状态格式无效，请检查 .collection/classification-state.json')
    return state


def mapped(config, key):
    shop_id, gid = key.split(':', 1)
    return config['mappings'].get(mapping_key(config, shop_id, gid), {}).get('shop_id') == shop_id


def plan(config, snapshot, state, shops=None):
    selected = set(shops or [s['id'] for s in config['shops']])
    unknown = selected - {s['id'] for s in config['shops']}
    if unknown:
        raise ValueError('未知店铺：' + ', '.join(sorted(unknown)))
    pending = {}
    completed_shops = {s['id'] for s in config['shops'] if s.get('initial_classification_completed_at')}
    for item in snapshot.get('review_items', []):
        key = item['shop_id'] + ':' + item['goods_id']
        if not mapped(config, key) and key not in config.get('exclusions', {}):
            pending.setdefault(item['shop_id'], []).append(key)
    jobs = {}
    for shop in snapshot.get('shops', []):
        shop_id = shop['id']
        saved = state.get('shops', {}).get(shop_id)
        if shop_id not in selected or shop_id in completed_shops or (saved and saved.get('status') == 'complete'):
            continue
        if shop.get('platform', '16688') not in {'16688', 'wzyp', 'catfk', 'acg'}:
            continue  # Directory-only sources have no supported detail approval adapter.
        # Classify only captured public items. A visibility-limited shelf cannot
        # prove disappearance, but each visible item can still be verified.
        if shop.get('collection_status') != 'ok':
            continue
        jobs[shop_id] = saved or {'status': 'pending', 'started_at': now(),
                                 'scope': 'public_visible_catalog',
                                 'keys': sorted(set(pending.get(shop_id, [])))}
    return jobs


def classify(shops=None, dry_run=False):
    config = json.loads(ai_review.SEEDS.read_text())
    snapshot = json.loads(ai_review.SNAPSHOT.read_text())
    state = read_state()
    jobs = plan(config, snapshot, state, shops)
    print(json.dumps({'shops_to_classify': len(jobs), 'items': sum(len(j['keys']) for j in jobs.values()),
                      'shops': {s: len(j['keys']) for s, j in jobs.items()}}, ensure_ascii=False), flush=True)
    if dry_run or not jobs:
        return {'shops': len(jobs), 'complete': 0, 'pending': 0}
    state['shops'].update(jobs)
    atomic_json(STATE, state)  # Freeze the first catalog before any paid/network operation.
    keys = {key for job in jobs.values() for key in job['keys']
            if job.get('outcomes', {}).get(key) not in TERMINAL}
    args = SimpleNamespace(keys=keys, shop=None, batch=10, workers=3, limit=0,
                           effort='medium', new_spec_only=False, min_confidence='medium', allow_price=[])
    if keys:
        triage_failed = ai_review.triage(args)
        failures = ai_review.inspect(args) or []
        unlisted_keys = {row['key'] for row in failures if row.get('status') == 'not_listed'}
        unsupported_keys = {row['key'] for row in failures if row.get('status') == 'needs_adapter'}
        failed_keys = {row['key'] for row in failures} - unlisted_keys - unsupported_keys
        triage_rows = ai_review.load_results()
        candidates = {item['key'] for item in ai_review.load_inputs(args)[1]
                      if triage_rows.get(item['key'], {}).get('title') == item['title']
                      and triage_rows.get(item['key'], {}).get('decision') == 'match'
                      and triage_rows.get(item['key'], {}).get('confidence') in ('high', 'medium')}
        # A stale draft left by an earlier attempt must not produce a terminal
        # rejection when this attempt could not read the current source.
        args.keys = candidates - failed_keys - unlisted_keys - unsupported_keys
        args.batch = 5
        detail_failed = ai_review.decide(args)
        applied = ai_review.apply(args)
        args.keys = keys
    else:
        applied = []
        failed_keys = set()
        unlisted_keys = set()
        unsupported_keys = set()
        triage_failed = detail_failed = 0
    config = json.loads(ai_review.SEEDS.read_text())
    products, pending_items = ai_review.load_inputs(args)
    current = {i['key']: i['title'] for i in pending_items}
    triage = ai_review.load_results()
    decisions = ai_review.load_decisions()
    held = {r['key'] for r in applied if r['status'] == 'held'}
    policy_rejected = {r['key'] for r in applied if r['status'] == 'policy_rejected'}
    unsupported_keys.update(r['key'] for r in applied if r['status'] == 'needs_adapter')
    complete = pending = 0
    completed_at = {}
    for shop_id, job in jobs.items():
        outcomes = {}
        for key in job['keys']:
            row = triage.get(key, {})
            if mapped(config, key):
                outcomes[key] = 'approved'
            elif key not in keys and job.get('outcomes', {}).get(key) in TERMINAL:
                outcomes[key] = job['outcomes'][key]
            elif key not in current:
                outcomes[key] = 'excluded_or_unlisted'
            elif key in unlisted_keys:
                outcomes[key] = 'excluded_or_unlisted'
            elif key in unsupported_keys:
                outcomes[key] = 'needs_adapter'
            elif key in failed_keys:
                outcomes[key] = 'pending'
            elif row.get('title') != current[key]:
                outcomes[key] = 'pending'
            elif row.get('decision') in ('irrelevant', 'new_spec'):
                outcomes[key] = row['decision']
            elif row.get('confidence') == 'low':
                outcomes[key] = 'insufficient_information'
            elif key in held:
                outcomes[key] = 'price_held'
            elif key in policy_rejected:
                outcomes[key] = 'rejected'
            elif ai_review.draft_path(key).exists():
                draft = json.loads(ai_review.draft_path(key).read_text())
                decision = decisions.get(key, {})
                outcomes[key] = ('rejected' if decision.get('decision') == 'reject'
                                 and ai_review.current_decision(decision, draft, products) else 'pending')
            else:
                outcomes[key] = 'pending'
        unresolved = sum(v == 'pending' for v in outcomes.values())
        job.update(status='pending' if unresolved else 'complete', updated_at=now(),
                   outcomes=outcomes, counts=dict(Counter(outcomes.values())))
        if unresolved:
            pending += 1
        else:
            complete += 1
            completed_at[shop_id] = job['updated_at']
        state['shops'][shop_id] = job
    if completed_at:
        # Keep completion with the primary shop configuration as well: deleting
        # local progress files or moving machines must not reclassify old shops.
        for seed in config['shops']:
            if seed['id'] in completed_at:
                seed['initial_classification_completed_at'] = completed_at[seed['id']]
                seed['initial_classification_scope'] = 'public_visible_catalog'
        atomic_json(ai_review.SEEDS, config)
    atomic_json(STATE, state)
    result = {'shops': len(jobs), 'complete': complete, 'pending': pending,
              'approved': sum(r['status'] == 'approved' for r in applied),
              'triage_batches_failed': triage_failed, 'detail_batches_failed': detail_failed}
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return result


def classify_batches(shops=None, dry_run=False, batch_shops=10):
    """Freeze the first catalog once; finish and persist independent shop groups."""
    if batch_shops < 1:
        raise ValueError('每组店铺数必须大于0')
    if dry_run:
        return classify(shops, True)
    config = json.loads(ai_review.SEEDS.read_text())
    snapshot = json.loads(ai_review.SNAPSHOT.read_text())
    state = read_state()
    jobs = plan(config, snapshot, state, shops)
    state['shops'].update(jobs)
    atomic_json(STATE, state)
    ids = list(jobs)
    totals = {'shops': 0, 'complete': 0, 'pending': 0, 'approved': 0,
              'triage_batches_failed': 0, 'detail_batches_failed': 0}
    run = {'started_at': now(), 'planned_shops': ids, 'groups': [], 'status': 'running'}
    atomic_json(RUN, run)
    for offset in range(0, len(ids), batch_shops):
        group = ids[offset:offset + batch_shops]
        run.update(current_shops=group, updated_at=now())
        atomic_json(RUN, run)
        print(json.dumps({'group': offset // batch_shops + 1, 'of': (len(ids) + batch_shops - 1) // batch_shops,
                          'shops': group}, ensure_ascii=False), flush=True)
        try:
            result = classify(group)
        except Exception as exc:
            run.update(status='failed', error=str(exc)[:300], finished_at=now())
            atomic_json(RUN, run)
            raise
        run['groups'].append({'shops': group, 'result': result, 'finished_at': now()})
        for key in totals:
            totals[key] += result.get(key, 0)
        run.update(totals=totals, updated_at=now())
        atomic_json(RUN, run)
    run.update(status='complete' if not totals['pending'] else 'needs_retry', finished_at=now())
    atomic_json(RUN, run)
    print(json.dumps({'run_finished': True, **totals}, ensure_ascii=False), flush=True)
    return totals


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shop', action='append', help='limit initial classification to this shop')
    parser.add_argument('--plan', action='store_true', help='inspect the plan without AI calls or writes')
    parser.add_argument('--batch-shops', type=int, default=10, help='persist completion after each group of shops')
    args = parser.parse_args()
    STATE.parent.mkdir(parents=True, exist_ok=True)
    import fcntl
    with STATE.with_suffix('.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('首次分类进程已在运行')
        classify_batches(args.shop, args.plan, args.batch_shops)


if __name__ == '__main__':
    main()
