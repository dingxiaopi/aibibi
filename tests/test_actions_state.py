import base64
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from collector.actions_run import public_progress
from collector.actions_state import seal, restore, prepare, StateError, key_from_env
from collector.actions_state import MAGIC

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    AESGCM = None


@unittest.skipUnless(AESGCM, 'Install ops/github-actions/requirements.txt for encrypted-state tests')
class EncryptedStateTests(unittest.TestCase):
    def fixture(self, root):
        root.mkdir()
        (root / 'instance.json').write_text(json.dumps({'version': 1, 'profile': 'sample', 'target': 'https://example.test'}))
        (root / 'seeds.json').write_text(json.dumps({'shops': [{'id': 'private-source'}], 'mappings': {}}))
        (root / 'snapshot.json').write_text(json.dumps({'quotes': [], 'generated_at': '2026-01-01T00:00:00Z'}))
        (root / 'collection').mkdir()
        (root / 'collection/collect-checkpoint.json').write_text('{"run_started_at":"original"}')
        (root / 'collection/update-state.json').write_text('{"phase":"pushing"}')
        (root / 'exports').mkdir()
        (root / 'exports/external-batch.json').write_text('{"generated_at":"original"}')
        return root

    def test_round_trip_preserves_original_times_checkpoints_and_exact_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root / 'source')
            (source / '.dev.vars').write_text('secret-that-must-never-be-packed')
            key = AESGCM.generate_key(bit_length=256)
            archive = root / 'sample.bin'
            seal(source, archive, 'sample', key)
            self.assertNotIn(b'private-source', archive.read_bytes())
            restore(archive, root / 'restored', 'sample', key)
            for path in source.rglob('*'):
                if path.is_file() and path.name != '.dev.vars':
                    self.assertEqual(path.read_bytes(), (root / 'restored' / path.relative_to(source)).read_bytes())
            self.assertFalse((root / 'restored/.dev.vars').exists())

    def test_wrong_key_tampering_and_profile_swap_fail_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root / 'source')
            key = AESGCM.generate_key(bit_length=256)
            archive = root / 'sample.bin'
            seal(source, archive, 'sample', key)
            for profile, supplied_key in [('sample', AESGCM.generate_key(bit_length=256)), ('production', key)]:
                with self.assertRaises(StateError):
                    restore(archive, root / 'restored', profile, supplied_key)
                self.assertFalse((root / 'restored').exists())
            data = bytearray(archive.read_bytes())
            data[-1] ^= 1
            archive.write_bytes(data)
            with self.assertRaises(StateError):
                restore(archive, root / 'restored', 'sample', key)
            self.assertFalse((root / 'restored').exists())

    def test_existing_work_is_never_overwritten_and_seal_uses_fresh_nonce(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root / 'source')
            key = AESGCM.generate_key(bit_length=256)
            archive = root / 'sample.bin'
            seal(source, archive, 'sample', key)
            before = archive.read_bytes()
            seal(source, archive, 'sample', key)
            self.assertNotEqual(before, archive.read_bytes())
            with self.assertRaisesRegex(StateError, 'not empty'):
                restore(archive, source, 'sample', key)
            self.assertEqual(json.loads((source / 'collection/update-state.json').read_text())['phase'], 'pushing')

    def test_symlinks_and_invalid_metadata_cannot_replace_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root / 'source')
            key = AESGCM.generate_key(bit_length=256)
            archive = root / 'sample.bin'
            seal(source, archive, 'sample', key)
            before = archive.read_bytes()
            (source / 'seeds.json').unlink()
            (source / 'seeds.json').symlink_to(root / 'sample.bin')
            with self.assertRaises(StateError):
                seal(source, archive, 'sample', key)
            self.assertEqual(before, archive.read_bytes())

    def test_key_is_environment_only_and_malformed_keys_fail_closed(self):
        key = AESGCM.generate_key(bit_length=256)
        with patch.dict(os.environ, {'COLLECTOR_STATE_KEY': base64.b64encode(key).decode()}):
            self.assertEqual(key_from_env(), key)
        for value in ['', 'not-base64', base64.b64encode(b'short').decode()]:
            with patch.dict(os.environ, {'COLLECTOR_STATE_KEY': value}):
                with self.assertRaises(StateError):
                    key_from_env()

    def test_authenticated_payload_still_cannot_extract_arbitrary_paths(self):
        import zlib
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            key = AESGCM.generate_key(bit_length=256)
            nonce = os.urandom(12)
            data = json.dumps({'version': 1, 'files': {'../leak': base64.b64encode(b'private').decode()}}).encode()
            archive = root / 'sample.bin'
            archive.write_bytes(MAGIC + nonce + AESGCM(key).encrypt(nonce, zlib.compress(data), MAGIC + b'/sample'))
            with self.assertRaises(StateError):
                restore(archive, root / 'restored', 'sample', key)
            self.assertFalse((root / 'leak').exists())
            self.assertFalse((root / 'restored').exists())

    def test_prepare_creates_bound_profile_without_changing_original_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root / 'source')
            before = {str(p.relative_to(source)): p.read_bytes() for p in source.rglob('*') if p.is_file()}
            key = AESGCM.generate_key(bit_length=256)
            archive = root / 'production.bin'
            prepare(source, archive, 'production', key, 'https://new.test')
            self.assertEqual(before, {str(p.relative_to(source)): p.read_bytes() for p in source.rglob('*') if p.is_file()})
            restore(archive, root / 'restored', 'production', key)
            metadata = json.loads((root / 'restored/instance.json').read_text())
            self.assertEqual(metadata['target'], 'https://new.test')
            self.assertEqual(metadata['profile'], 'production')
            with self.assertRaises(StateError):
                prepare(source, archive, 'production', key, 'https://new.test')

    def test_history_compaction_preserves_observations_and_does_not_modify_source(self):
        import sqlite3
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.fixture(root / 'source')
            (source / 'runtime').mkdir()
            path = source / 'runtime/prices.sqlite3'
            with sqlite3.connect(path) as db:
                db.execute('CREATE TABLE observations(at TEXT,price REAL)')
                db.execute('INSERT INTO observations VALUES(?,?)', ('2026-01-01T00:00:00Z', 10))
                db.execute('CREATE TABLE snapshots(at TEXT,data TEXT)')
                db.executemany('INSERT INTO snapshots VALUES(?,?)', [('2026-01-01', 'old'), ('2026-01-02', 'new')])
            key = AESGCM.generate_key(bit_length=256)
            seal(source, root / 'sample.bin', 'sample', key)
            restore(root / 'sample.bin', root / 'restored', 'sample', key)
            with sqlite3.connect(root / 'restored/runtime/prices.sqlite3') as db:
                self.assertEqual(db.execute('SELECT * FROM observations').fetchall(), [('2026-01-01T00:00:00Z', 10.0)])
                self.assertEqual(db.execute('SELECT * FROM snapshots').fetchall(), [('2026-01-02', 'new')])
            with sqlite3.connect(path) as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM snapshots').fetchone()[0], 2)


class AggregateLogTests(unittest.TestCase):
    def test_only_aggregate_progress_is_public(self):
        self.assertEqual(public_progress(json.dumps({'completed': 2, 'total': 4, 'shop_id': 'private-id', 'error': 'private-url'})),
                         'Collection progress: 2/4 shops')
        self.assertEqual(public_progress('推送 25/100（恢复时已完成 10 批）'), 'Transfer progress: 25/100 batches')
        self.assertEqual(public_progress('== 2/4 采集全部店铺（逐店落盘，可 --resume）'), 'Pipeline stage: collect')
        for value in ['Authorization: private-token', 'https://private-store.example', '{"shop_id":"private"}',
                      'RuntimeError: raw source description', '{"completed":"private","total":4}']:
            self.assertIsNone(public_progress(value))


if __name__ == '__main__':
    unittest.main()
