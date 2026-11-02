"""Import public shop links as discovery leads, never import third-party quotes."""
import argparse
import json
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit
from collector.paths import SEEDS, DATA_DIR
from collector.collect import ROOT, atomic_json, now
from collector.sources import SHOP_CAPACITY, directory_url

SOURCE = 'user-provided'

def discover(payload, previous=None):
    if not isinstance(payload, dict) or not isinstance(payload.get('shops_index'), list):
        raise ValueError('Missing shop directory')
    old = {row['url']: row for row in (previous or {}).get('leads', [])}
    leads = {}
    stamp = now()
    for item in payload['shops_index']:
        if not isinstance(item, dict) or not isinstance(item.get('url'), str):
            continue
        resolved = directory_url(item)
        if not resolved: continue
        parts = urlsplit(resolved)
        if parts.scheme not in ('https', 'http') or not parts.hostname or parts.username or parts.password:
            continue
        host = parts.hostname.lower()
        # Remove affiliate/tracking parameters from the discovery URL; never adopt their referral relationship.
        clean = urlunsplit((parts.scheme, parts.netloc.lower(), parts.path.rstrip('/') or '/', '', ''))
        if clean in leads:
            continue
        match = re.fullmatch(r'/shop/(S\d+)', parts.path.rstrip('/')) if host in ('16688.com.cn', 'www.16688.com.cn') else None
        lead = {'url': clean, 'name_hint': str(item.get('name', ''))[:200],
                'platform_hint': str(item.get('platform', 'unknown'))[:40], 'discovered_from': SOURCE,
                'first_seen': old.get(clean, {}).get('first_seen', stamp), 'last_seen': stamp,
                'status': old.get(clean, {}).get('status', 'pending'),
                'supported_adapter': '16688' if match else None}
        if match:
            lead['shop_id'] = match.group(1)
        leads[clean] = lead
    # Keep historical leads without implying their source is still current.
    for url, item in old.items():
        if url not in leads:
            leads[url] = {**item, 'status': 'not_in_latest_directory'}
    return {'schema_version': 1, 'discovered_at': stamp, 'source': SOURCE, 'leads': list(leads.values())}

def activate_supported(config, queue):
    existing = {s['id'] for s in config['shops']}
    for lead in queue['leads']:
        if lead['supported_adapter'] == '16688' and lead['status'] != 'not_in_latest_directory':
            if lead['shop_id'] not in existing:
                if len(existing) >= min(config.get('shop_limit', SHOP_CAPACITY), SHOP_CAPACITY):
                    lead['status'] = 'capacity_pending'
                    continue
                config['shops'].append({'id': lead['shop_id'], 'discovered_from': SOURCE,
                                        'discovery_note': '第三方公开目录仅用于发现；报价直接采集16688源站'})
                existing.add(lead['shop_id'])
            seed = next(s for s in config['shops'] if s['id'] == lead['shop_id'])
            lead['status'] = 'disabled' if seed.get('enabled') is False or seed.get('disabled_at') else 'queued_for_source_check'
    return config

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True, help='Your own JSON lead list with a shops_index array')
    parser.add_argument('--activate-supported', action='store_true')
    args = parser.parse_args()
    payload = json.loads(args.input.read_text())
    path = DATA_DIR / 'discovery.json'
    previous = json.loads(path.read_text()) if path.exists() else {}
    queue = discover(payload, previous)
    if args.activate_supported:
        config_path = SEEDS
        config = activate_supported(json.loads(config_path.read_text()), queue)
        atomic_json(config_path, config)
    atomic_json(path, queue)
    print(json.dumps({'leads': len(queue['leads']), 'supported': sum(x['supported_adapter']=='16688' for x in queue['leads'])}))

if __name__ == '__main__':
    main()
