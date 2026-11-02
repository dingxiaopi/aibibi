#!/usr/bin/env python3
"""AI triage of pending review items with the local Codex CLI.

    python3 -m collector.ai_review triage            # all pending items, resumable
    python3 -m collector.ai_review triage --limit 200
    python3 -m collector.ai_review summary           # counts and new-spec hints
    python3 -m collector.ai_review inspect           # fetch full details of matched items
    python3 -m collector.ai_review decide            # Codex reads details, fills mappings
    python3 -m collector.ai_review apply             # price check, then the normal approve
    python3 -m collector.ai_review propose           # group new-spec hints into proposals to tick
    python3 -m collector.ai_review accept            # add ticked proposals, then re-triage their items

Each batch goes to `codex exec` in a read-only sandbox with a JSON Schema for
the answer, or, when .env.ai-review exists, to that OpenAI-compatible API. Answers are validated (every item answered, sku exists, fields
filled) and saved per batch under .runtime/ai-review/, so every step resumes.
Triage only labels items. Approval still goes through collector.review.approve,
which re-reads the source and rejects any change since inspection.
"""
import argparse
import hashlib
import json
import subprocess
import sys
import os
import re
import tempfile
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from collector.paths import SEEDS, SNAPSHOT, DATABASE, RUNTIME_DIR

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = Path(__file__).resolve().parent / 'prompts'
WORK = RUNTIME_DIR / 'ai-review'
OUT = WORK / 'triage'
DRAFTS = WORK / 'drafts'
DECIDED = WORK / 'decisions'
# Empty uses the CLI's own model selection. Existing instances may override it.
from collector.paths import CONFIG
MODEL = os.environ.get('AI_REVIEW_CLI_MODEL') or CONFIG.get('ai_cli_model', '')
DECISIONS = {'match', 'irrelevant', 'new_spec'}
# Optional third-party API (ignored by git): AI_REVIEW_BASE_URL, AI_REVIEW_API_KEY, AI_REVIEW_MODEL.
API_ENV = ROOT / '.env.ai-review'


def selected_keys(args=None):
    keys = getattr(args, 'keys', None)
    shops = set(getattr(args, 'shop', None) or [])
    if keys is not None:
        return set(keys)
    if shops:
        snapshot = json.loads(SNAPSHOT.read_text())
        return {r['shop_id'] + ':' + r['goods_id'] for r in snapshot.get('review_items', [])
                if r['shop_id'] in shops}
    return None


def load_inputs(args=None):
    seeds = json.loads(SEEDS.read_text())
    snapshot = json.loads(SNAPSHOT.read_text())
    products = [{k: p.get(k) for k in ('id', 'category', 'name', 'spec', 'channel')} for p in seeds['products']]
    items, seen = [], set()
    selected = selected_keys(args)
    for item in snapshot.get('review_items', []):
        key = f"{item['shop_id']}:{item['goods_id']}"
        if key not in seen and key not in seeds.get('exclusions', {}) and (selected is None or key in selected):
            seen.add(key)
            items.append({'key': key, 'title': item.get('name', '')})
    return products, items


def batch_id(items, salt=''):
    """Stable across runs as long as the batch holds the same items."""
    text = salt + '\n'.join(i['key'] + '\t' + i.get('title', i.get('name', '')) for i in items)
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def catalog_digest(products):
    return hashlib.sha256(json.dumps(products, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def current_decision(decision, draft, products):
    return (decision.get('review_fingerprint') == draft['fingerprint']
            and decision.get('catalog_digest') == catalog_digest(products))


def validate_shape(result, items, decisions):
    rows = result.get('results')
    if not isinstance(rows, list):
        raise ValueError('缺少 results')
    if not all(isinstance(r, dict) and isinstance(r.get('key'), str) for r in rows):
        raise ValueError('审核结论必须为对象')
    by_key = {r.get('key'): r for r in rows}
    if len(by_key) != len(rows) or set(by_key) != {i['key'] for i in items}:
        expected = {i['key'] for i in items}
        raise ValueError(f'审核结论有重复、缺失或额外的商品：缺失{sorted(expected - set(by_key))[:3]}，'
                         f'额外{sorted(set(by_key) - expected)[:3]}，重复{len(rows) - len(by_key)}')
    missing = [i['key'] for i in items if i['key'] not in by_key]
    if missing:
        raise ValueError(f'有 {len(missing)} 件未给出结论')
    rows = [by_key[i['key']] for i in items]
    for r in rows:
        if r.get('decision') not in decisions:
            raise ValueError(f"非法结论 {r.get('decision')}")
    return rows


def validate(result, items, skus):
    rows = validate_shape(result, items, DECISIONS)
    for r in rows:
        if r['decision'] == 'match' and r.get('sku') not in skus:
            raise ValueError(f"不存在的规格 {r.get('sku')}")
    return rows


def api_config():
    env = dict(line.split('=', 1) for line in API_ENV.read_text().splitlines()
               if '=' in line and not line.startswith('#')) if API_ENV.exists() else {}
    keys = ('AI_REVIEW_BASE_URL', 'AI_REVIEW_API_KEY', 'AI_REVIEW_MODEL')
    result = {k: os.environ.get(k, env.get(k, '')).strip() for k in keys}
    if not any(result.values()):
        return None
    if not all(result.values()):
        raise ValueError('AI API 配置不完整：需要 AI_REVIEW_BASE_URL、AI_REVIEW_API_KEY、AI_REVIEW_MODEL')
    return result


def run_api(api, payload, effort, prompt):
    schema = json.loads((PROMPTS / f'{prompt}.schema.json').read_text())
    if prompt in ('triage', 'detail') and payload.get('items'):
        # Model output must copy source identities verbatim; never repair a
        # truncated goods ID by guessing which product it meant.
        schema['properties']['results']['items']['properties']['key']['enum'] = [
            item['key'] for item in payload['items']]
    body = {'model': api['AI_REVIEW_MODEL'], 'reasoning_effort': effort,
            'messages': [{'role': 'system', 'content': (PROMPTS / f'{prompt}.md').read_text()},
                         {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}],
            'response_format': {'type': 'json_schema', 'json_schema': {'name': prompt, 'strict': True, 'schema': schema}}}
    request = urllib.request.Request(api['AI_REVIEW_BASE_URL'].rstrip('/') + '/chat/completions',
                                     data=json.dumps(body).encode(), method='POST',
                                     headers={'Authorization': 'Bearer ' + api['AI_REVIEW_API_KEY'],
                                              'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=1800) as response:
        text = json.loads(response.read())['choices'][0]['message']['content']
    # Some gateways wrap the JSON in a code fence despite the schema.
    return json.loads(re.sub(r'^```(?:json)?\s*|\s*```$', '', text.strip()))


def run_codex(payload, effort, prompt='triage'):
    api = api_config()
    if api:
        return run_api(api, payload, effort, prompt)
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / 'out.json'
        cmd = ['codex', 'exec', *(['-m', MODEL] if MODEL else []), '-c', f'model_reasoning_effort="{effort}"', '-s', 'read-only',
               '--skip-git-repo-check', '--ephemeral', '-C', tmp,
               '--output-schema', str(PROMPTS / f'{prompt}.schema.json'), '-o', str(out),
               (PROMPTS / f'{prompt}.md').read_text()]
        proc = subprocess.run(cmd, input=json.dumps(payload, ensure_ascii=False), capture_output=True, text=True, timeout=1800)
        if proc.returncode != 0 or not out.exists():
            raise RuntimeError((proc.stderr or proc.stdout)[-400:])
        return json.loads(out.read_text())


def triage_batch(products, items, effort, attempts=2, salt=''):
    skus = {p['id'] for p in products}
    path = OUT / f'{batch_id(items, salt)}.json'
    if path.exists():
        return path, 'skipped'
    error = None
    for _ in range(attempts):
        try:
            rows = validate(run_codex({'products': products, 'items': items}, effort), items, skus)
            temp = path.with_suffix('.tmp')
            temp.write_text(json.dumps({'items': items, 'results': rows}, ensure_ascii=False, indent=1))
            temp.replace(path)
            return path, 'done'
        except Exception as exc:  # retry once, then leave the batch for the next run
            error = exc
    return path, f'failed: {str(error)[:200]}'


def triage(args):
    OUT.mkdir(parents=True, exist_ok=True)
    products, items = load_inputs(args)
    salt = ''
    if args.new_spec_only:
        # After accept: re-ask the items grouped under accepted proposals, as fresh batches.
        catalog = {p['id'] for p in products}
        keys = {k for prop in json.loads(PROPOSALS.read_text()) if prop['id'] in catalog for k in prop['members']}
        items = [i for i in items if i['key'] in keys]
        salt = json.dumps(sorted(p['id'] for p in products))
    elif getattr(args, 'recheck', False):
        # Explicit catalog additions may make a previous new_spec matchable.
        # Bind this recheck to the complete definitions, not only the SKU IDs.
        salt = json.dumps(products, ensure_ascii=False, sort_keys=True)
    else:
        # A new collection shifts batch boundaries; skip items already answered under the same title.
        known = load_results()
        items = [i for i in items if known.get(i['key'], {}).get('title') != i['title']]
    items = items[:args.limit] if args.limit else items
    batches = [items[i:i + args.batch] for i in range(0, len(items), args.batch)]
    print(f'{len(items)} 件，{len(batches)} 批，并发 {args.workers}', file=sys.stderr, flush=True)
    done = failed = 0
    with ThreadPoolExecutor(args.workers) as pool:
        futures = [pool.submit(triage_batch, products, b, args.effort, salt=salt) for b in batches]
        for n, future in enumerate(as_completed(futures), 1):
            path, status = future.result()
            failed += status.startswith('failed')
            done += status != 'skipped' and not status.startswith('failed')
            print(f'[{n}/{len(batches)}] {path.name} {status}', file=sys.stderr, flush=True)
    print(f'完成 {done} 批，失败 {failed} 批（重跑会只处理未完成的批次）', file=sys.stderr)
    return failed


def load_results():
    """Later batches win, so a re-triage after adding specs replaces earlier answers."""
    rows = {}
    for path in sorted(OUT.glob('*.json'), key=lambda p: p.stat().st_mtime):
        data = json.loads(path.read_text())
        titles = {i['key']: i['title'] for i in data['items']}
        for r in data['results']:
            rows[r['key']] = {**r, 'title': titles[r['key']]}
    return rows


def summary(args):
    rows = load_results()
    print('结论', dict(Counter(r['decision'] for r in rows.values())))
    print('置信度', dict(Counter(r['confidence'] for r in rows.values())))
    matched = Counter(r['sku'] for r in rows.values() if r['decision'] == 'match')
    print('匹配最多的规格', matched.most_common(15))


def pending_keys(args=None):
    return {item['key'] for item in load_inputs(args)[1]}


def draft_path(key):
    return DRAFTS / (key.replace(':', '--', 1) + '.json')


def inspect(args):
    """Fetch full details for confident matches; one shop listing is reused for all its items."""
    from collector.review import draft
    from collector.review_batch import Observer
    from collector.sources import UnlistedItem, UnsupportedItem
    DRAFTS.mkdir(parents=True, exist_ok=True)
    config = json.loads(SEEDS.read_text())
    shops = {s['id']: s for s in config['shops']}
    pending = {i['key']: i['title'] for i in load_inputs(args)[1]}
    snapshot = json.loads(SNAPSHOT.read_text())
    checked = {s['id']: s.get('checked_at', '') for s in snapshot.get('shops', [])}
    def current_draft(key):
        from collector.collect import mapping_key, plain
        path = draft_path(key)
        if not path.exists():
            return False
        d = json.loads(path.read_text())
        shop_id, gid = key.split(':', 1)
        mapping = config['mappings'].get(mapping_key(config, shop_id, gid), {})
        return (d.get('previous_fingerprint') == mapping.get('accepted_fingerprint')
                and plain(d['raw'].get('name')) == pending[key]
                and d.get('checked_at', '') >= checked.get(shop_id, ''))
    wanted = {'high'} if args.min_confidence == 'high' else {'high', 'medium'}
    keys = sorted(k for k, r in load_results().items()
                  if r['decision'] == 'match' and r['confidence'] in wanted and k in pending
                  and r.get('title') == pending[k] and not current_draft(k))
    keys = keys[:args.limit] if args.limit else keys
    print(f'待抓取详情 {len(keys)} 件', file=sys.stderr, flush=True)
    observer, failures = Observer(), []
    for n, key in enumerate(keys, 1):  # sorted keys keep each shop's items together
        shop_id, goods_id = key.split(':', 1)
        try:
            result = draft(config, shops[shop_id], goods_id, observer(shops[shop_id], goods_id))
            draft_path(key).write_text(json.dumps(result, ensure_ascii=False, indent=1))
            status = 'ok'
        except Exception as exc:  # unsupported platform, delisted item, source failure
            kind = 'not_listed' if isinstance(exc, UnlistedItem) else 'needs_adapter' if isinstance(exc, UnsupportedItem) else 'failed'
            failures.append({'key': key, 'status': kind, 'error': str(exc)[:200]})
            status = kind + ': ' + str(exc)[:80]
        print(f'[{n}/{len(keys)}] {key} {status}', file=sys.stderr, flush=True)
    (WORK / 'inspect-failures.json').write_text(json.dumps(failures, ensure_ascii=False, indent=1))
    unlisted = sum(row.get('status') == 'not_listed' for row in failures)
    unsupported = sum(row.get('status') == 'needs_adapter' for row in failures)
    print(f'完成 {len(keys) - len(failures)} 件，已下架 {unlisted} 件，需适配 {unsupported} 件，失败 {len(failures) - unlisted - unsupported} 件', file=sys.stderr)
    return failures


def detail_text(raw, limit=None):
    from collector.collect import plain
    parts = [plain(raw.get('description'))]
    if isinstance(raw.get('content'), str):
        parts.append(plain(raw['content']))
    text = '\n'.join(p for p in parts if p)
    return text[:limit] if limit is not None else text


def load_decisions():
    """A decision belongs to the inspected description, not merely to a product ID."""
    rows = {}
    for path in sorted(DECIDED.glob('*.json'), key=lambda p: p.stat().st_mtime):
        data = json.loads(path.read_text())
        items = {i['key']: i for i in data.get('items', [])}
        for row in data['results']:
            rows[row['key']] = {**row, 'review_fingerprint': items.get(row['key'], {}).get('review_fingerprint'),
                                'catalog_digest': data.get('catalog_digest')}
    return rows


def validate_decisions(result, items, skus):
    rows = validate_shape(result, items, ('approve', 'reject'))
    for r in rows:
        if r['decision'] == 'approve':
            if r.get('sku') not in skus:
                raise ValueError(f"不存在的规格 {r.get('sku')}")
            if not all(r.get(f, '').strip() for f in ('channel', 'warranty', 'restriction', 'spec_evidence')):
                raise ValueError(f"{r['key']} 批准但字段未填全")
    return rows


def decide_batch(products, items, effort):
    from collector.collect import atomic_json
    skus = {p['id'] for p in products}
    signature = catalog_digest(products)
    salt = signature + json.dumps([i.get('review_fingerprint') for i in items])
    path = DECIDED / f'{batch_id(items, salt)}.json'
    error = None
    for _ in range(2):
        try:
            rows = validate_decisions(run_codex({'products': products, 'items': items}, effort, 'detail'), items, skus)
            atomic_json(path, {'items': items, 'results': rows, 'catalog_digest': signature})
            return path, 'done'
        except Exception as exc:
            error = exc
    return path, f'failed: {str(error)[:200]}'


def decide(args):
    """Codex reads each fetched detail and either fills the mapping or rejects it."""
    from collector.collect import plain
    DECIDED.mkdir(parents=True, exist_ok=True)
    products = load_inputs()[0]
    triage_rows, done = load_results(), load_decisions()
    pending = pending_keys(args)
    items = []
    for path in sorted(DRAFTS.glob('*.json')):
        d = json.loads(path.read_text())
        key = f"{d['shop_id']}:{d['goods_id']}"
        if key not in pending or current_decision(done.get(key, {}), d, products):
            continue
        items.append({'key': key, 'name': plain(d['raw'].get('name')), 'description': detail_text(d['raw']),
                      'price': d['raw'].get('price'), 'suggested_sku': triage_rows.get(key, {}).get('sku'),
                      'review_fingerprint': d['fingerprint']})
    batches = [items[i:i + args.batch] for i in range(0, len(items), args.batch)]
    print(f'{len(items)} 件，{len(batches)} 批', file=sys.stderr, flush=True)
    failed = 0
    with ThreadPoolExecutor(args.workers) as pool:
        futures = [pool.submit(decide_batch, products, b, args.effort) for b in batches]
        for n, future in enumerate(as_completed(futures), 1):
            path, status = future.result()
            failed += status.startswith('failed')
            print(f'[{n}/{len(batches)}] {path.name} {status}', file=sys.stderr, flush=True)
    return failed


def reference_prices(snapshot):
    prices = {}
    for q in snapshot.get('quotes', []):
        if q.get('collection_status') == 'ok' and q.get('availability') == 'ready':
            prices.setdefault(q['sku'], []).append(float(q['price']))
    return prices


def price_problem(price, refs):
    """Only judged when the sku already has at least two live quotes to compare with."""
    if len(refs) < 2:
        return None
    median = sorted(refs)[len(refs) // 2]
    # Ratios are too strict for sub-yuan items (¥0.6 vs ¥0.1), so a gap under ¥1 always passes.
    if abs(price - median) >= 1 and not 0.4 * median <= price <= 2.5 * median:
        return f'价格 ¥{price} 偏离同规格中位数 ¥{median}'
    return None


def apply(args):
    """Approve Codex-approved items through the normal path (source re-read, fingerprint check)."""
    from collector.collect import atomic_json, database
    from collector.review import approve
    from collector.review_batch import Observer
    from collector.sources import UnsupportedItem
    config = json.loads(SEEDS.read_text())
    snapshot = json.loads(SNAPSHOT.read_text())
    products = load_inputs()[0]
    pending = pending_keys(args)
    observer, log = Observer(), []
    approvals = sorted(
        (r for r in load_decisions().values()
         if r['decision'] == 'approve' and r['key'] in pending and draft_path(r['key']).exists()
         and current_decision(r, json.loads(draft_path(r['key']).read_text()), products)),
        key=lambda r: r['key'])
    approvals = approvals[:args.limit] if args.limit else approvals
    for n, decision in enumerate(approvals, 1):
        key = decision['key']
        review = json.loads(draft_path(key).read_text())
        problem = None if key in args.allow_price else price_problem(
            float(review['raw'].get('price') or 0), reference_prices(snapshot).get(decision['sku'], []))
        if problem:
            log.append({'key': key, 'status': 'held', 'reason': problem})
        else:
            review['mapping'] = {f: decision[f] for f in ('sku', 'channel', 'warranty', 'restriction', 'spec_evidence')}
            try:
                config, snapshot, quote = approve(config, snapshot, review, observer)
                snapshot['products'] = config['products']
                with database(DATABASE) as db:
                    db.execute('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?)',
                               (snapshot['generated_at'], quote['id'], quote['checked_at'], quote['price'], quote['stock_status']))
                # Persist after each approval so an interruption loses nothing.
                atomic_json(SEEDS, config)
                atomic_json(SNAPSHOT, snapshot)
                log.append({'key': key, 'status': 'approved', 'sku': quote['sku'], 'price': quote['price']})
            except Exception as exc:
                kind = 'policy_rejected' if str(exc).startswith('收录规则排除') else 'needs_adapter' if isinstance(exc, UnsupportedItem) else 'failed'
                log.append({'key': key, 'status': kind, 'reason': str(exc)[:200]})
                # Re-read failed source verifications on the next attempt instead
                # of repeatedly applying the same obsolete inspection.
                if kind == 'failed':
                    draft_path(key).unlink(missing_ok=True)
        print(f"[{n}/{len(approvals)}] {key} {log[-1]['status']} {log[-1].get('reason', '')}", file=sys.stderr, flush=True)
    with (WORK / 'apply-log.jsonl').open('a') as f:
        for row in log:
            f.write(json.dumps(row, ensure_ascii=False) + '\n')
    counts = Counter(r['status'] for r in log)
    print(f"批准 {counts['approved']}，价格待查 {counts['held']}，需适配 {counts['needs_adapter']}，"
          f"规则排除 {counts['policy_rejected']}，失败 {counts['failed']}；"
          '本地已更新；推送线上前先检查 apply-log.jsonl', file=sys.stderr)
    return log


PROPOSALS = WORK / 'proposals.json'
CHECKLIST = WORK / 'proposals.md'


def propose(args):
    """One Codex call groups the distinct new-spec hints into at most 50 proposals."""
    products = load_inputs()[0]
    pending = pending_keys()
    grouped = {}
    for key, r in load_results().items():
        if r['decision'] == 'new_spec' and key in pending and r.get('new_spec_hint'):
            grouped.setdefault(r['new_spec_hint'].strip(), []).append(r)
    hints = [{'i': n, 'hint': hint, 'count': len(rows), 'example': rows[0]['title']}
             for n, (hint, rows) in enumerate(sorted(grouped.items(), key=lambda kv: -len(kv[1])))]
    print(f'{sum(h["count"] for h in hints)} 件，{len(hints)} 条不同建议', file=sys.stderr, flush=True)
    result = run_codex({'products': products, 'hints': hints}, args.effort, 'propose')
    known, seen, proposals = {p['id'] for p in products}, set(), []
    for prop in result.get('proposals', []):
        members = [m for m in prop['members'] if 0 <= m < len(hints) and m not in seen]
        if prop['id'] in known or not members:
            continue
        seen.update(members)
        known.add(prop['id'])
        keys = [r['key'] for m in members for r in grouped[hints[m]['hint']]]
        titles = [r['title'] for m in members for r in grouped[hints[m]['hint']]]
        proposals.append({**prop, 'members': keys, 'examples': titles[:3]})
    proposals.sort(key=lambda p: -len(p['members']))
    PROPOSALS.write_text(json.dumps(proposals, ensure_ascii=False, indent=1))
    lines = ['# 新规格提案', '', '把要加入的提案改成 `- [x]`，保存后运行 `python3 -m collector.ai_review accept`。', '']
    for prop in proposals:
        lines += [f"- [ ] `{prop['id']}` {prop['name']} · {prop['spec']} · {prop['channel']}（{len(prop['members'])} 件）",
                  f"  - {prop['rationale']}"]
        lines += [f'  - 例：{t}' for t in prop['examples']]
    CHECKLIST.write_text('\n'.join(lines) + '\n')
    covered = sum(len(p['members']) for p in proposals)
    print(f'{len(proposals)} 个提案，覆盖 {covered} 件；勾选清单：{CHECKLIST}', file=sys.stderr)


def ticked(text):
    return [line.split('`')[1] for line in text.splitlines() if line.startswith('- [x] `')]


def accept(args):
    """Add ticked proposals to the catalog; their items are then re-triaged with `triage --new-spec-only`."""
    from collector.collect import atomic_json
    proposals = {p['id']: p for p in json.loads(PROPOSALS.read_text())}
    ids = ticked(CHECKLIST.read_text())
    unknown = [i for i in ids if i not in proposals]
    if unknown:
        raise SystemExit(f'清单里有提案文件中不存在的 id：{unknown}')
    config = json.loads(SEEDS.read_text())
    existing = {p['id'] for p in config['products']}
    # The site picks brand icons by brand, so it always follows the category.
    added = [{**{k: proposals[i][k] for k in ('id', 'category', 'name', 'spec', 'channel', 'family', 'kind')},
              'brand': proposals[i]['category']}
             for i in ids if i not in existing]
    config['products'] += added
    atomic_json(SEEDS, config)
    print(f"新增 {len(added)} 个规格：{', '.join(p['id'] for p in added) or '无'}；"
          '接着运行 triage --new-spec-only，再 inspect / decide / apply', file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest='command', required=True)
    t = sub.add_parser('triage')
    t.add_argument('--batch', type=int, default=10)
    t.add_argument('--workers', type=int, default=3)
    t.add_argument('--limit', type=int, default=0)
    t.add_argument('--effort', default='medium')
    t.add_argument('--new-spec-only', action='store_true', help='re-ask items of accepted proposals')
    t.add_argument('--recheck', action='store_true', help='explicitly recheck selected pending titles against the current catalog')
    t.add_argument('--shop', action='append', help='only classify this shop; repeat for multiple shops')
    t.set_defaults(func=triage)
    s = sub.add_parser('summary')
    s.set_defaults(func=summary)
    i = sub.add_parser('inspect')
    i.add_argument('--min-confidence', choices=['high', 'medium'], default='medium')
    i.add_argument('--limit', type=int, default=0)
    i.add_argument('--shop', action='append')
    i.set_defaults(func=inspect)
    d = sub.add_parser('decide')
    d.add_argument('--batch', type=int, default=5)
    d.add_argument('--workers', type=int, default=3)
    d.add_argument('--effort', default='medium')
    d.add_argument('--shop', action='append')
    d.set_defaults(func=decide)
    pr = sub.add_parser('propose')
    pr.add_argument('--effort', default='high')
    pr.set_defaults(func=propose)
    ac = sub.add_parser('accept')
    ac.set_defaults(func=accept)
    a = sub.add_parser('apply')
    a.add_argument('--limit', type=int, default=0)
    a.add_argument('--allow-price', nargs='*', default=[], metavar='KEY',
                   help='held items a person has checked; skip only the price check for them')
    a.add_argument('--shop', action='append')
    a.set_defaults(func=apply)
    args = parser.parse_args()
    result = args.func(args)
    if (isinstance(result, int) and result) or (args.command == 'inspect' and
            any(row.get('status', 'failed') not in ('not_listed', 'needs_adapter') for row in result or [])):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
