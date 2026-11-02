import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from collector import update
from collector.checkpoint import digest
from collector.update import dev_vars


class DevVarsTests(unittest.TestCase):
    def test_reads_plain_and_quoted_values_and_skips_comments(self):
        text = '# comment\nADMIN_PASSWORD="secret value"\nCOLLECTOR_INGEST_TOKEN=abc\n\nBROKEN\n'
        self.assertEqual(dev_vars(text), {'ADMIN_PASSWORD': 'secret value', 'COLLECTOR_INGEST_TOKEN': 'abc'})


class ResumeTests(unittest.TestCase):
    def test_resume_classification_does_not_recollect_and_exports_reviewed_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot, bundle = root/'snapshot.json', root/'bundle.json'
            snapshot.write_text(json.dumps({'stats': {'shops': 1, 'shops_ok': 1}, 'changes': []}))
            bundle.write_text('{}')
            (root/'update-state.json').write_text(json.dumps({
                'phase': 'classifying', 'destination': update.PRODUCTION, 'dry_run': False}))
            with patch.object(update, 'STATE_DIR', root), patch.object(update, 'SNAPSHOT', snapshot), \
                    patch.object(update, 'BUNDLE', bundle), \
                    patch.object(update, 'dev_vars', return_value={'COLLECTOR_INGEST_TOKEN': 'test-token-' * 4}), \
                    patch.object(update, 'run_logged', return_value=(0, 'classified')) as run, \
                    patch.object(update, 'node', return_value=(0, '{"ok":true}')) as node, \
                    patch.object(update, 'live_coverage', return_value=(1, 1)), \
                    patch('sys.argv', ['update', '--resume']):
                update.main()
                self.assertEqual(run.call_count, 1)
                self.assertEqual(run.call_args.args[0][-1], 'collector.classification')
                self.assertEqual([call.args[0] for call in node.call_args_list],
                                 ['sync-local.mjs', 'export-local.mjs', 'push-local.mjs'])

    def test_dry_run_never_calls_ai_or_pushes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot, bundle = root/'snapshot.json', root/'bundle.json'
            snapshot.write_text(json.dumps({'stats': {}, 'changes': []}))
            bundle.write_text('{}')
            with patch.object(update, 'STATE_DIR', root), patch.object(update, 'SNAPSHOT', snapshot), \
                    patch.object(update, 'BUNDLE', bundle), \
                    patch.object(update, 'run_logged', return_value=(0, 'collected')) as run, \
                    patch.object(update, 'node', return_value=(0, 'exported')) as node, \
                    patch('sys.argv', ['update', '--dry-run']):
                update.main()
                self.assertEqual(run.call_count, 1)
                self.assertEqual(run.call_args.args[0][-1], 'collector.collect')
                self.assertEqual([call.args[0] for call in node.call_args_list], ['export-local.mjs'])

    def test_resume_push_uses_exact_bundle_without_sync_export_or_collection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state_dir = root / 'state'
            state_dir.mkdir()
            snapshot = root / 'snapshot.json'
            snapshot.write_text(json.dumps({'stats': {'shops': 1, 'shops_ok': 1, 'ready_quotes': 1}, 'changes': []}))
            bundle = root / 'bundle.json'
            bundle.write_text(json.dumps({'generated_at': 'original'}))
            (state_dir / 'update-state.json').write_text(json.dumps({
                'phase': 'pushing', 'destination': update.PRODUCTION, 'dry_run': False,
                'bundle_digest': digest(json.loads(bundle.read_text())),
            }))
            with patch.object(update, 'STATE_DIR', state_dir), patch.object(update, 'SNAPSHOT', snapshot), \
                    patch.object(update, 'BUNDLE', bundle), patch.object(update, 'dev_vars', return_value={'COLLECTOR_INGEST_TOKEN': 'test-token-' * 4}), \
                    patch.object(update, 'node', return_value=(0, '{"ok":true}')) as node, \
                    patch.object(update, 'run_logged') as collect, patch.object(update, 'live_coverage', side_effect=OSError('network')), \
                    patch('sys.argv', ['update', '--resume']):
                update.main()
                self.assertEqual([call.args[0] for call in node.call_args_list], ['push-local.mjs'])
                collect.assert_not_called()
                self.assertEqual(json.loads((state_dir / 'update-state.json').read_text())['phase'], 'complete')
                self.assertEqual(json.loads(bundle.read_text()), {'generated_at': 'original'})

    def test_tampered_push_bundle_stops_before_network_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bundle = root / 'bundle.json'
            bundle.write_text('{}')
            (root / 'update-state.json').write_text(json.dumps({
                'phase': 'pushing', 'destination': update.PRODUCTION, 'dry_run': False, 'bundle_digest': 'different',
            }))
            with patch.object(update, 'STATE_DIR', root), patch.object(update, 'BUNDLE', bundle), \
                    patch.object(update, 'dev_vars', return_value={'COLLECTOR_INGEST_TOKEN': 'test-token-' * 4}), \
                    patch.object(update, 'node') as node, patch('sys.argv', ['update', '--resume']):
                with self.assertRaisesRegex(SystemExit, '已变化'):
                    update.main()
                node.assert_not_called()

    def test_failed_preflight_does_not_start_collection(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(update, 'STATE_DIR', Path(directory)), \
                    patch.object(update, 'dev_vars', return_value={'COLLECTOR_INGEST_TOKEN': 'test-token-' * 4}), \
                    patch.object(update, 'node', return_value=(1, 'fetch failed')), \
                    patch.object(update, 'run_logged') as collect, patch('sys.argv', ['update']):
                with self.assertRaisesRegex(SystemExit, '同步失败'):
                    update.main()
                collect.assert_not_called()


if __name__ == '__main__':
    unittest.main()
