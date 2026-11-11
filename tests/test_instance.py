import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from collector.init_instance import initialize
from scripts.export_public import export_public

ROOT = Path(__file__).resolve().parents[1]


class InstanceTests(unittest.TestCase):
    def test_python_and_node_share_isolated_paths_from_any_working_directory(self):
        with tempfile.TemporaryDirectory(prefix='aibibi paths ') as directory:
            base = Path(directory).resolve()
            config = base / 'collector.json'
            config.write_text(json.dumps({'url': 'https://instance.example',
                                         'runtime_dir': 'should-not-be-inherited',
                                         'state_dir': 'should-not-be-inherited'}))
            env = {k: v for k, v in os.environ.items() if not k.startswith('BIJIA_')}
            env.update(BIJIA_DATA_DIR=str(base / 'data'), BIJIA_INSTANCE_CONFIG=str(config), PYTHONPATH=str(ROOT))
            python = subprocess.check_output(['python3', '-c',
                'import json; from collector import paths as p; '
                'print(json.dumps({k:str(getattr(p,k)) for k in ["SEEDS","SNAPSHOT","DATABASE","STATE_DIR","BUNDLE"]}))'],
                cwd=directory, env=env, text=True)
            module = (ROOT / 'cloudflare/scripts/lib/instance.mjs').as_uri()
            node = subprocess.check_output(['node', '--input-type=module', '-e',
                f'import {{instancePaths}} from {json.dumps(module)}; const p=instancePaths(); '
                'console.log(JSON.stringify({SEEDS:p.seeds,SNAPSHOT:p.snapshot,DATABASE:p.database,STATE_DIR:p.state,BUNDLE:p.bundle}));'],
                cwd=directory, env=env, text=True)
            paths = json.loads(python)
            self.assertEqual(paths, json.loads(node))
            self.assertTrue(all(str(base / 'data') in path for path in paths.values()))

    def test_initialization_never_overwrites_data_or_imports_external_mappings(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            sources = base / 'sources.json'
            sources.write_text(json.dumps({'shops': [{'id': 'S123', 'enabled': False}],
                                           'mappings': {'untrusted': {}}, 'exclusions': {'bad': 'value'}}))
            path = initialize(base / 'data', sources)
            value = json.loads(path.read_text())
            self.assertEqual(value['mappings'], {})
            self.assertEqual(value['exclusions'], {})
            self.assertTrue(value['products'])
            before = path.read_bytes()
            with self.assertRaisesRegex(ValueError, 'never overwrites'):
                initialize(base / 'data', sources)
            self.assertEqual(before, path.read_bytes())

    def test_public_export_excludes_private_data_history_and_build_products(self):
        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory) / 'source', Path(directory) / 'public'
            for name in ['LICENSE', 'README.md', 'config/site.json', 'collector/collect.py',
                         '.local/seeds.json', 'collector/seeds.json', 'dist/data/snapshot.json',
                         '.env.ai-review', 'cloudflare/.dev.vars', 'cloudflare/.dev.vars.example',
                         'cloudflare/wrangler.local.jsonc', 'cloudflare/public/app.js',
                         'cloudflare/src/index.ts', 'cloudflare/.local/site.json',
                         'cloudflare/node_modules/package/index.js', '.git/config', 'docs/private.md',
                         '.github/ISSUE_TEMPLATE/bug_report.yml', '.github/PULL_REQUEST_TEMPLATE.md',
                         '.github/ISSUE_TEMPLATE/private-draft.md', 'ops/github-actions/collect.yml',
                         'ops/github-actions/requirements.txt', 'ops/github-actions/official-prices.yml', 'ops/github-actions/watchdog.yml',
                         'ops/github-actions/private-state.bin']:
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(name)
            export_public(source, target)
            files = {p.relative_to(target).as_posix() for p in target.rglob('*') if p.is_file()}
            self.assertEqual(files, {'LICENSE', 'README.md', 'config/site.json', 'collector/collect.py',
                                     'cloudflare/.dev.vars.example', 'cloudflare/src/index.ts',
                                     '.github/ISSUE_TEMPLATE/bug_report.yml', '.github/PULL_REQUEST_TEMPLATE.md',
                                     'ops/github-actions/collect.yml', 'ops/github-actions/official-prices.yml',
                                     'ops/github-actions/watchdog.yml', 'ops/github-actions/requirements.txt'})
            with self.assertRaisesRegex(ValueError, 'overwrite'):
                export_public(source, target)

    def test_public_export_rejects_secret_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source'
            (source / 'cloudflare/src').mkdir(parents=True)
            (source / 'LICENSE').write_text('MIT')
            secret = Path(directory) / 'private'
            secret.write_text('private value')
            (source / 'cloudflare/src/leak.ts').symlink_to(secret)
            with self.assertRaisesRegex(ValueError, 'Symlink'):
                export_public(source, Path(directory) / 'public')

    def test_invalid_initialization_creates_no_instance_files(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            sources = base / 'sources.json'
            for value in [{'shops': [None]}, {'shops': [], 'shop_limit': False},
                          {'shops': [{'id': 'S1'}, {'id': 'S1'}]}, []]:
                sources.write_text(json.dumps(value))
                with self.assertRaises(ValueError):
                    initialize(base / 'data', sources)
                self.assertFalse((base / 'data').exists())


if __name__ == '__main__':
    unittest.main()
