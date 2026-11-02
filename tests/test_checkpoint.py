import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from collector.checkpoint import Checkpoint
from collector.collect import collect


class CheckpointTests(unittest.TestCase):
    def test_interrupted_collection_resumes_only_unfinished_shops_and_preserves_timestamps(self):
        config = {'shops': [{'id': 'S1'}, {'id': 'S2'}], 'products': [], 'mappings': {}}
        calls = []
        def fetch(endpoint, payload):
            sid = payload['shop_no']
            calls.append((endpoint, sid))
            if sid == 'S2':
                raise KeyboardInterrupt()
            return {'shop_no': sid, 'name': sid} if endpoint == 'shop/detail' else {'list': []}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'checkpoint.json'
            checkpoint = Checkpoint(path, config, {})
            with self.assertRaises(KeyboardInterrupt):
                collect(config, {}, fetch=fetch, pause=lambda _: None, checkpoint=checkpoint)
            saved = json.loads(path.read_text())
            self.assertEqual([s['id'] for s in saved['shops']], ['S1'])
            calls.clear()
            def resumed_fetch(endpoint, payload):
                calls.append(payload['shop_no'])
                return {'shop_no': 'S2', 'name': 'S2'} if endpoint == 'shop/detail' else {'list': []}
            resumed = collect(config, {}, fetch=resumed_fetch, pause=lambda _: None,
                              checkpoint=Checkpoint(path, config, {}, resume=True))
            self.assertEqual(calls, ['S2', 'S2'])
            self.assertEqual(resumed['shops'][0]['checked_at'], saved['shops'][0]['checked_at'])
            self.assertEqual(resumed['run_started_at'], saved['run_started_at'])
            self.assertEqual(resumed['stats']['shops_ok'], 2)

    def test_configuration_or_baseline_change_cannot_reuse_checkpoint(self):
        config = {'shops': [], 'products': [], 'mappings': {}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'checkpoint.json'
            Checkpoint(path, config, {}).save('time', [], [], [], [], config)
            with self.assertRaisesRegex(ValueError, '未完成'):
                Checkpoint(path, config, {})
            for changed, baseline in [({**config, 'exclusions': {'S1:G1': 'excluded'}}, {}), (config, {'generated_at': 'new'})]:
                with self.assertRaisesRegex(ValueError, '已变化'):
                    Checkpoint(path, changed, baseline, resume=True)
            self.assertIsNone(Checkpoint(path, config, {}, restart=True).state)
