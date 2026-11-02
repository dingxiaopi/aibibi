"""Local collection checkpoints; never replace a published snapshot mid-run."""
import hashlib
import json
from pathlib import Path


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def collection_key(config):
    return digest({'classification_policy': 'initial_once_v1',
                   **{key: config.get(key) for key in ('shops', 'mappings', 'products', 'exclusions', 'shop_limit')}})


class Checkpoint:
    def __init__(self, path, config, previous, resume=False, restart=False):
        self.path = Path(path)
        self.key = collection_key(config)
        self.previous = digest(previous)
        self.state = None
        if self.path.exists() and not restart:
            if not resume:
                raise ValueError('发现未完成采集，请用 --resume 续采，或 --restart 开始新一轮')
            state = json.loads(self.path.read_text())
            if state.get('config_key') != self.key or state.get('previous_key') != self.previous:
                raise ValueError('配置或旧快照已变化，不能复用检查点；请用 --restart 重新采集')
            ids = [s['id'] for s in state['shops']]
            if (ids != [s['id'] for s in config['shops'][:len(ids)]] or
                    len(state['logs']) != len(ids)):
                raise ValueError('采集检查点不完整，请检查文件或使用 --restart')
            self.state = state

    def save(self, at, shops, quotes, reviews, logs, config):
        from collector.collect import atomic_json
        atomic_json(self.path, {
            'version': 1, 'config_key': self.key, 'previous_key': self.previous,
            'run_started_at': at, 'shops': shops, 'quotes': quotes,
            'reviews': reviews, 'logs': logs,
            'closed_shops': [s for s in config['shops'] if s.get('disabled_at')],
        })

    def finish(self):
        self.path.unlink(missing_ok=True)
