import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from collector import actions_run


class Started(Exception):
    pass


class ActionsRunModeTests(unittest.TestCase):
    def command(self, mode, event='workflow_dispatch', phase=None):
        """Return the collector command a run would start, without running it."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data, state = root / 'data', root / 'data/collection'
            state.mkdir(parents=True)
            (data / 'instance.json').write_text(json.dumps({'profile': 'hosted', 'target': 'https://example.test'}))
            (data / 'seeds.json').write_text(json.dumps({'shops': [{'id': 'source'}]}))
            if phase:
                (state / 'update-state.json').write_text(json.dumps({'phase': phase}))
            env = {'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': event, 'BIJIA_INGEST_TOKEN': 'x' * 32}
            popen = patch.object(actions_run.subprocess, 'Popen', side_effect=lambda command, **_: (_ for _ in ()).throw(Started(command)))
            with patch.dict(os.environ, env), popen, \
                    patch.object(actions_run, 'DATA_DIR', data), patch.object(actions_run, 'STATE_DIR', state), \
                    patch.object(actions_run, 'SEEDS', data / 'seeds.json'), \
                    patch.object(actions_run, 'TARGET_URL', 'https://example.test'):
                try:
                    actions_run.run(mode)
                except Started as started:
                    return started.args[0]
        self.fail('collector did not start')

    def test_auto_updates_when_idle_and_resumes_unfinished_work(self):
        idle = self.command('auto', event='schedule')
        self.assertNotIn('--resume', idle)
        self.assertNotIn('--dry-run', idle)
        self.assertIn('--resume', self.command('auto', event='schedule', phase='pushing'))
        self.assertIn('--resume', self.command('auto', phase='collecting'))

    def test_schedule_only_allows_auto_and_other_events_are_refused(self):
        for mode in ('update', 'restart', 'probe'):
            with self.assertRaises(ValueError):
                self.command(mode, event='schedule')
        with self.assertRaises(ValueError):
            self.command('auto', event='push')
        with self.assertRaises(ValueError):
            self.command('update', phase='pushing')


if __name__ == '__main__':
    unittest.main()
