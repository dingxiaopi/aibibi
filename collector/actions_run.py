"""Run an existing collector pipeline with aggregate-only Actions logging."""
import argparse
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
from urllib.parse import urlsplit

from collector.paths import DATA_DIR, ROOT, SEEDS, SNAPSHOT, STATE_DIR, BUNDLE, TARGET_URL


def public_progress(line):
    """Merchant identities and source error messages never enter workflow logs."""
    try:
        entry = json.loads(line)
        if all(isinstance(entry.get(k), int) and not isinstance(entry.get(k), bool) for k in ('completed', 'total')):
            return f"Collection progress: {entry['completed']}/{entry['total']} shops"
        if entry.get('ok') is True and isinstance(entry.get('batches'), int):
            return f"Transfer received: {entry['batches']} batches"
    except (ValueError, AttributeError):
        pass
    if line.startswith('== '):
        for marker, phase in [('同步线上状态', 'sync'), ('采集全部店铺', 'collect'),
                              ('导出增量', 'export'), ('推送实例', 'push'), ('恢复原导出包', 'resume transfer')]:
            if marker in line:
                return 'Pipeline stage: ' + phase
    match = re.fullmatch(r'推送 (\d+)/(\d+)(?:（恢复时已完成 \d+ 批）)?', line.strip())
    if match:
        return f'Transfer progress: {match[1]}/{match[2]} batches'
    return None


def run(mode):
    if mode not in ('probe', 'update', 'resume', 'restart'):
        raise ValueError('Unknown collection mode')
    if os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_EVENT_NAME') != 'workflow_dispatch':
        raise ValueError('Real collection requires a manual workflow dispatch')
    instance = json.loads((DATA_DIR / 'instance.json').read_text())
    url = urlsplit(TARGET_URL)
    if (url.scheme != 'https' or not url.hostname or url.username or url.password or
            url.path not in ('', '/') or url.query or url.fragment or
            instance.get('target') != TARGET_URL.rstrip('/')):
        raise ValueError('Configured target does not match the restored instance')
    config = json.loads(SEEDS.read_text())
    if not config.get('shops'):
        raise ValueError('No configured sources in restored state')
    state_file = STATE_DIR / 'update-state.json'
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    unfinished = state.get('phase') not in (None, 'complete') or (STATE_DIR / 'collect-checkpoint.json').exists()
    if mode == 'resume' and not unfinished:
        raise ValueError('No unfinished update to resume')
    if mode not in ('resume', 'restart') and unfinished:
        raise ValueError('Unfinished update exists; select resume before starting another run')
    probe = mode == 'probe' or (mode == 'resume' and state.get('dry_run') is True)
    command = [sys.executable, '-m', 'collector.update', '--no-ai', '--url', TARGET_URL,
               '--min-success-ratio', '0.8']
    if probe:
        command.append('--dry-run')
    if mode == 'resume':
        command.append('--resume')
    elif mode == 'restart':
        command.append('--restart')
    if not probe and len(os.environ.get('BIJIA_INGEST_TOKEN', '')) < 24:
        raise ValueError('Missing collector credential')
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    private_log = STATE_DIR / 'actions.log'
    process = subprocess.Popen(command, cwd=ROOT, env=os.environ.copy(), stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace',
                               start_new_session=True)
    def stop(signum, frame):
        try:
            # SIGINT lets the existing orchestrator clean up its own children.
            os.killpg(process.pid, signal.SIGINT)
        except ProcessLookupError:
            pass
    previous = {sig: signal.signal(sig, stop) for sig in (signal.SIGTERM, signal.SIGINT)}
    try:
        with private_log.open('a') as log:
            for line in process.stdout:
                log.write(line)
                log.flush()
                progress = public_progress(line)
                if progress:
                    print(progress, flush=True)
        code = process.wait()
    finally:
        process.stdout.close()
        for sig, handler in previous.items():
            signal.signal(sig, handler)
        if process.poll() is None:
            stop(signal.SIGTERM, None)
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=30)
    snapshot = json.loads(SNAPSHOT.read_text())
    progress_path = STATE_DIR / 'push-progress.json'
    push = json.loads(progress_path.read_text()) if progress_path.exists() else {}
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    summary = {
        'mode': mode, 'probe': probe, 'profile': instance['profile'], 'success': code == 0,
        'shops': len(config['shops']), 'shops_ok': snapshot.get('stats', {}).get('shops_ok', 0),
        'ready_quotes': snapshot.get('stats', {}).get('ready_quotes', 0),
        'review_items': snapshot.get('stats', {}).get('review_items', 0),
        'observed_at': snapshot.get('generated_at'), 'phase': state.get('phase'),
        'pushed': not probe and code == 0 and state.get('phase') == 'complete'
                  and push.get('status') == 'complete' and push.get('endpoint') == TARGET_URL.rstrip('/')
                  and isinstance(push.get('total'), int) and push.get('total', 0) > 0
                  and push.get('done') == push.get('total'),
        'batches_done': push.get('done', 0) if not probe else 0,
        'batches_total': push.get('total', 0) if not probe else 0,
    }
    if code == 0 and not probe and not summary['pushed']:
        code = 2
        summary['success'] = False
    (STATE_DIR / 'actions-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary), flush=True)
    step_summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if step_summary:
        with open(step_summary, 'a') as file:
            file.write('## Collector result\n\n' + '\n'.join(f'- {key}: {value}' for key, value in summary.items()) + '\n')
    return code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['probe', 'update', 'resume', 'restart'], required=True)
    args = parser.parse_args()
    try:
        code = run(args.mode)
    except (ValueError, OSError):
        parser.exit(2, 'Collector preflight failed. Check profile, target, credential and unfinished progress.\n')
    if code:
        parser.exit(code, 'Collection did not complete. Private diagnostics and resumable state are being saved.\n')


if __name__ == '__main__':
    main()
