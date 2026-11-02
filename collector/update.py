"""One-command update: sync instance state, collect every shop, and push data.

    python3 -m collector.update             # collect and push to the configured instance
    python3 -m collector.update --dry-run   # collect and export only; nothing leaves this machine

AI classifies each shop's initial catalog once. Subsequent updates reuse approved
classifications; new items in an already classified shop wait outside comparison.
--dry-run and --no-ai skip classification without marking a shop complete.

Credentials come from environment variables or local cloudflare/.dev.vars.
The push retries each batch with backoff; --resume continues durable local progress.
"""
import argparse
import json
import os
import subprocess
import sys
import time
from urllib.request import Request, urlopen, build_opener, ProxyHandler

from collector.paths import SNAPSHOT, STATE_DIR, BUNDLE
from collector.collect import ROOT, atomic_json, now
from collector.checkpoint import digest
from collector.paths import TARGET_URL

# Backward-compatible name for callers; fresh instances target localhost.
PRODUCTION = TARGET_URL
CLOUDFLARE = ROOT / 'cloudflare'


def dev_vars(text=None):
    values = {}
    path = CLOUDFLARE / '.dev.vars'
    for line in (text if text is not None else path.read_text() if path.exists() else '').splitlines():
        key, sep, value = line.partition('=')
        if sep and not key.strip().startswith('#'):
            values[key.strip()] = value.strip().strip('"\'')
    return values


def step(title):
    print(f'\n== {title}', file=sys.stderr, flush=True)
    return time.monotonic()


def run_logged(command, cwd, env):
    """Stream progress immediately and retain it across chat/process interruptions."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    last = ''
    with (STATE_DIR / 'update.log').open('a') as log:
        log.write(f'\n{now()} command: {command[0]} {command[-1]}\n')
        log.flush()
        proc = subprocess.Popen(command, cwd=cwd, env=env, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, bufsize=1)
        try:
            for line in proc.stdout:
                print(line, end='', file=sys.stderr, flush=True)
                log.write(line)
                log.flush()
                if line.strip():
                    last = line.strip()
        except BaseException:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
            raise
        finally:
            proc.stdout.close()
        return proc.wait(), last


def node(script, env):
    return run_logged(['node', '--import', './scripts/proxy.mjs', f'scripts/{script}'],
                      CLOUDFLARE, env)


def stats():
    return json.loads(SNAPSHOT.read_text()).get('stats', {}) if SNAPSHOT.exists() else {}


def live_coverage(url, proxy=None):
    # Cloudflare answers the default Python-urllib User-Agent with 403.
    request = Request(url + f'/api/products?fresh={int(time.time())}',
                      headers={'Accept': 'application/json', 'User-Agent': 'ai-bijia-update/1'})
    open_url = build_opener(ProxyHandler({'https': proxy, 'http': proxy})).open if proxy else urlopen
    products = json.load(open_url(request, timeout=30))['products']
    return sum(p.get('min_price') is not None for p in products), len(products)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--dry-run', action='store_true', help='collect and export only; no production writes')
    parser.add_argument('--url', default=PRODUCTION)
    parser.add_argument('--proxy', help='explicit proxy for this run; credentials are never logged')
    parser.add_argument('--no-ai', action='store_true', help='skip initial shop classification this run')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--resume', action='store_true', help='resume collection or the exact exported push plan')
    mode.add_argument('--restart', action='store_true', help='start a new collection, replacing unfinished local progress')
    args = parser.parse_args()
    started = time.monotonic()
    args.url = args.url.rstrip('/')
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    import fcntl
    with (STATE_DIR / 'update.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('已有更新进程运行，请勿重复启动')
        state_path = STATE_DIR / 'update-state.json'
        state = json.loads(state_path.read_text()) if state_path.exists() else {}
        checkpoint = STATE_DIR / 'collect-checkpoint.json'
        if args.resume:
            if state and (state.get('destination') != args.url or state.get('dry_run') != args.dry_run):
                raise SystemExit('续传目标或 dry-run 模式不同，请使用原参数；新一轮用 --restart')
            if state.get('phase') == 'complete':
                raise SystemExit('上一轮已完成；开始新一轮时不带 --resume')
            if not state and not checkpoint.exists():
                raise SystemExit('没有未完成任务；开始新一轮时不带 --resume')
        elif not args.restart and (checkpoint.exists() or state.get('phase') not in (None, 'complete')):
            raise SystemExit('存在未完成任务，请用 --resume，或用 --restart 开始新一轮')
        if not args.resume:
            state = {'destination': args.url, 'dry_run': args.dry_run, 'started_at': now(),
                     'before': stats()}
        elif not state:
            state = {'destination': args.url, 'dry_run': args.dry_run, 'started_at': now(),
                     'before': stats()}

        def phase(name, **values):
            state.update(phase=name, updated_at=now(), **values)
            atomic_json(state_path, state)

        env = {**os.environ, 'BIJIA_URL': args.url}
        proxy = args.proxy or env.get('BIJIA_PROXY')
        if proxy:
            env['BIJIA_PROXY'] = proxy
            # urllib uses the same explicit proxy as the Node transport.
            env['HTTPS_PROXY'] = env['HTTP_PROXY'] = proxy
            env.pop('https_proxy', None)
            env.pop('http_proxy', None)
        if not args.dry_run:
            env['BIJIA_INGEST_TOKEN'] = (env.get('BIJIA_INGEST_TOKEN') or
                env.get('COLLECTOR_INGEST_TOKEN') or dev_vars().get('COLLECTOR_INGEST_TOKEN', ''))
            if len(env['BIJIA_INGEST_TOKEN']) < 24:
                raise SystemExit('请通过环境变量 BIJIA_INGEST_TOKEN 或本地 .dev.vars 配置采集令牌')

        resume_push = args.resume and state.get('phase') in ('exported', 'pushing')
        if resume_push:
            if not BUNDLE.exists() or digest(json.loads(BUNDLE.read_text())) != state.get('bundle_digest'):
                raise SystemExit('导出包已变化，不能复用原推送计划；请检查或使用 --restart')
            step('恢复原导出包推送，不重新采集或导出')
        else:
            if not args.dry_run:
                step('1/4 同步线上状态并检查代理/鉴权（失败时不启动长采集）')
                code, line = node('sync-local.mjs', env)
                if code:
                    raise SystemExit(f'同步失败，请检查网络、BIJIA_PROXY 或 --proxy：{line}')
            collected = args.resume and state.get('phase') in ('collected', 'classifying', 'classified')
            if collected and state.get('phase') != 'classifying' and (not SNAPSHOT.exists() or digest(json.loads(SNAPSHOT.read_text())) != state.get('snapshot_digest')):
                raise SystemExit('本轮快照已变化，请检查或使用 --restart')
            if not collected:
                # Recover the narrow crash window between the child's final snapshot write
                # and the parent's stage update. Never infer completion from shop count alone.
                snapshot = json.loads(SNAPSHOT.read_text()) if SNAPSHOT.exists() else {}
                finalized = (args.resume and state.get('phase') == 'collecting' and not checkpoint.exists()
                             and snapshot.get('stats', {}).get('shops_ok', 0) > 0
                             and snapshot.get('run_started_at', '') >= state.get('started_at', '~'))
                if not finalized:
                    t = step('2/4 采集全部店铺（逐店落盘，可 --resume）')
                    phase('collecting')
                    command = [sys.executable, '-m', 'collector.collect']
                    if args.restart:
                        command.append('--restart')
                    elif args.resume:
                        command.append('--resume')
                    code, _ = run_logged(command, ROOT, env)
                    if code:
                        raise SystemExit(f'采集退出（{code}），修复后用 --resume 继续')
                    print(f'本次采集用时 {(time.monotonic() - t) / 60:.1f} 分钟', file=sys.stderr)
                phase('collected', snapshot_digest=digest(json.loads(SNAPSHOT.read_text())))
            if not args.dry_run and not args.no_ai and state.get('phase') != 'classified':
                step('首次分类：仅处理尚未完成首次分类的店铺，已分类店铺不调用 AI')
                phase('classifying')
                code, line = run_logged([sys.executable, '-m', 'collector.classification'], ROOT, env)
                if code:
                    raise SystemExit(f'首次分类未完成：{line}；用 --resume 继续，不重新采集')
                phase('classified', snapshot_digest=digest(json.loads(SNAPSHOT.read_text())))
            step('3/4 导出增量定义和精简采集包')
            code, line = node('export-local.mjs', env)
            if code:
                raise SystemExit(f'导出失败：{line}')
            phase('exported', bundle_digest=digest(json.loads(BUNDLE.read_text())))

        after = stats()
        summary = [f"采集 {after.get('shops_ok')}/{after.get('shops')} 家成功",
                   f"可比价报价 {state.get('before', {}).get('ready_quotes')} → {after.get('ready_quotes')}",
                   f"未进入比价 {after.get('review_items')} 件（含新规格、未分类或未通过审核的商品）"]
        summary.append(f"价格变化 {len(json.loads(SNAPSHOT.read_text()).get('changes', []))} 条")
        if args.dry_run:
            step('4/4 跳过推送（--dry-run）')
        else:
            step(f'4/4 推送实例（逐批自动退避重试，进度写入 {STATE_DIR}）')
            phase('pushing')
            code, line = node('push-local.mjs', env)
            if code or '"ok":true' not in line:
                raise SystemExit(f'推送未完成：{line}；修复后用 --resume 继续同一包')
            # Persist completion before an optional public read can fail.
            phase('complete')
            try:
                priced, total = live_coverage(args.url, proxy)
                summary.append(f'线上有报价规格 {priced}/{total}')
            except Exception:
                summary.append('推送已完成；公开覆盖查询失败，可稍后单独验收')
        phase('complete')
        summary.append(f'本次执行用时 {(time.monotonic() - started) / 60:.1f} 分钟；日志 {STATE_DIR / "update.log"}')
        print('\n' + '\n'.join(summary))

if __name__ == '__main__':
    main()
