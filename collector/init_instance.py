"""Initialize a new instance without collecting or overwriting existing data."""
import argparse
import json
from pathlib import Path
from collector.paths import ROOT, DATA_DIR, SEEDS, SNAPSHOT


def initialize(directory, sources=None):
    directory = Path(directory)
    seeds, snapshot = directory / 'seeds.json', directory / 'snapshot.json'
    if seeds.exists() or snapshot.exists():
        raise ValueError('Instance already contains data; initialization never overwrites it')
    source_config = json.loads(Path(sources).read_text()) if sources else {'shops': [], 'shop_limit': 200}
    if not isinstance(source_config, dict):
        raise ValueError('Source configuration must be a JSON object')
    shops = source_config.get('shops')
    limit = source_config.get('shop_limit', 200)
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 200:
        raise ValueError('shop_limit must be an integer between 1 and 200')
    if (not isinstance(shops, list) or len(shops) > limit or
            any(not isinstance(s, dict) or not isinstance(s.get('id'), str) or not s['id'] for s in shops) or
            len({s['id'] for s in shops}) != len(shops)):
        raise ValueError('Invalid shop list or duplicate IDs')
    products = json.loads((ROOT / 'config/catalog.json').read_text())['products']
    config = {'shop_limit': limit, 'shops': shops, 'products': products, 'mappings': {}, 'exclusions': {}}
    empty = {'products': products, 'shops': [], 'quotes': [], 'review_items': [],
             'collection_log': [], 'changes': [], 'stats': {}}
    directory.mkdir(parents=True, exist_ok=True)
    seeds.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    snapshot.write_text(json.dumps(empty, ensure_ascii=False, indent=2) + '\n')
    return seeds


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, help='Your source JSON; only shops and shop_limit are used')
    args = parser.parse_args()
    try:
        print('Initialized:', initialize(DATA_DIR, args.sources))
    except ValueError as error:
        parser.exit(2, str(error) + '\n')


if __name__ == '__main__':
    main()
