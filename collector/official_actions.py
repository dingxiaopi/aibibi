"""Manual official-price Actions entry point; no shop state or website publication."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

from .official_prices import APPS, REGIONS, OUTPUT, fx_rates, refresh


def scope_for(source, regions):
    codes = [r['code'] for r in regions]
    scope = set()
    if source in ('supported', 'ios'):
        scope.update((a['id'], r, 'ios') for a in APPS for r in codes)
    if source in ('supported', 'gemini'):
        scope.update(('gemini', r, 'web') for r in codes)
    if source == 'chatgpt':
        scope.update(('chatgpt', r, 'web') for r in codes)
    if not scope:
        raise ValueError('Unknown official source')
    return scope


def assess(result, scope, started_at):
    """Count fresh, usable source groups, never retained or unrelated prices."""
    failed = {(f['app'], f['region'], f.get('channel', 'ios')) for f in result['failures']}
    usable = set()
    for row in result['prices']:
        key = (row['app'], row['region'], row.get('channel', 'ios'))
        try:
            observed = datetime.fromisoformat(row.get('observed_at', '').replace('Z', '+00:00'))
            fresh = observed.tzinfo is not None and started_at <= observed <= datetime.now(timezone.utc)
        except (ValueError, TypeError):
            fresh = False
        if key in scope and key not in failed and row['status'] == 'ok' and not row.get('stale') and fresh:
            usable.add(key)
    totals = Counter((a, c) for a, _, c in scope)
    counts = Counter((a, c) for a, _, c in usable)
    groups = [{'app': a, 'channel': c, 'successful_regions': counts[a, c], 'requested_regions': n,
               'passed': counts[a, c] / n >= 0.8} for (a, c), n in sorted(totals.items())]
    errors = [f for f in result['failures'] if (f['app'], f['region'], f.get('channel', 'ios')) in scope]
    return {'accepted': bool(groups) and all(g['passed'] for g in groups), 'groups': groups,
            'successful_sources': len(usable), 'requested_sources': len(scope), 'failures': errors}


def run(previous, source, regions, **kwargs):
    result = previous
    if source in ('supported', 'ios'):
        result = refresh(result, channels=('ios',), regions=regions, **kwargs)
    if source in ('supported', 'gemini', 'chatgpt'):
        app_id = 'chatgpt' if source == 'chatgpt' else 'gemini'
        result = refresh(result, channels=('web',), apps=[a for a in APPS if a['id'] == app_id],
                         regions=regions, **kwargs)
    return result


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', choices=['supported', 'ios', 'gemini', 'chatgpt'], default='supported')
    parser.add_argument('--mode', choices=['probe', 'collect'], default='probe')
    parser.add_argument('--regions', default='', help='Comma-separated allowlisted codes; probe defaults us,ph; collect defaults all')
    parser.add_argument('--previous', type=Path, default=OUTPUT)
    parser.add_argument('--output-dir', type=Path, default=Path('.local/official-prices'))
    args = parser.parse_args()
    codes = set(args.regions.split(',')) if args.regions.strip() else ({'us', 'ph'} if args.mode == 'probe' else {r['code'] for r in REGIONS})
    if codes - {r['code'] for r in REGIONS}:
        parser.error('Unknown region code')
    regions = [r for r in REGIONS if r['code'] in codes]
    scope = scope_for(args.source, regions)
    started = datetime.now(timezone.utc).replace(microsecond=0)
    report = {'source': args.source, 'mode': args.mode, 'started_at': started.isoformat(), 'accepted': False}
    try:
        previous = json.loads(args.previous.read_text()) if args.previous.exists() else {}
        result = run(previous, args.source, regions, fx=fx_rates(),
                     progress=lambda app, region, status: print(f'{app}/{region}: {status}', flush=True))
        report.update(assess(result, scope, started))
        write_json(args.output_dir / 'snapshot.json', result)
    except Exception as error:
        report['error'] = str(error)[:300]
    report['completed_at'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
    write_json(args.output_dir / 'report.json', report)
    summary = f"Official prices: {args.source} / {args.mode}\n\n"
    summary += f"Accepted: {report['accepted']}; fresh source groups: {report.get('successful_sources', 0)}/{len(scope)}.\n\n"
    for group in report.get('groups', []):
        summary += f"- {group['app']} / {group['channel']}: {group['successful_regions']}/{group['requested_regions']} regions\n"
    summary += '\nProbe never saves the durable snapshot. Collection requires at least 80% fresh successful regions for every selected app/channel. Website publication is separate.\n'
    if report.get('error'):
        summary += '\nError: ' + report['error'] + '\n'
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
            output.write(summary)
    return 0 if report['accepted'] else 1


if __name__ == '__main__':
    sys.exit(main())
