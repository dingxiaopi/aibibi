"""Instance paths shared by every local command; relative paths use repository root.

Environment variables take precedence over .local/collector.json. Configuration
contains paths and target URLs only; credentials belong in the environment.
"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def resolve_path(value):
    path = Path(value).expanduser()
    return (ROOT / path).resolve() if not path.is_absolute() else path.resolve()


def settings():
    path = resolve_path(os.environ.get('BIJIA_INSTANCE_CONFIG', '.local/collector.json'))
    if os.environ.get('BIJIA_INSTANCE_CONFIG') and not path.exists():
        raise ValueError('Explicit instance configuration does not exist')
    value = json.loads(path.read_text()) if path.exists() else {}
    if not isinstance(value, dict):
        raise ValueError('Instance configuration must be a JSON object')
    return value


CONFIG = settings()
DATA_DIR = resolve_path(os.environ.get('BIJIA_DATA_DIR') or CONFIG.get('data_dir') or '.local/data')


def configured_path(env_name, key, default):
    # An explicit data directory describes an isolated instance: do not inherit
    # another instance's legacy progress/history paths from local configuration.
    value = os.environ.get(env_name)
    if not value and not os.environ.get('BIJIA_DATA_DIR'):
        value = CONFIG.get(key)
    return resolve_path(value or default)


SEEDS = DATA_DIR / 'seeds.json'
SNAPSHOT = DATA_DIR / 'snapshot.json'
RUNTIME_DIR = configured_path('BIJIA_RUNTIME_DIR', 'runtime_dir', DATA_DIR / 'runtime')
STATE_DIR = configured_path('BIJIA_STATE_DIR', 'state_dir', DATA_DIR / 'collection')
EXPORT_DIR = configured_path('BIJIA_EXPORT_DIR', 'export_dir', DATA_DIR / 'exports')
DATABASE = RUNTIME_DIR / 'prices.sqlite3'
BUNDLE = EXPORT_DIR / 'external-batch.json'
TARGET_URL = os.environ.get('BIJIA_URL') or CONFIG.get('url') or 'http://127.0.0.1:8787'
