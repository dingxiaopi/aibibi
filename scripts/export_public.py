"""Assemble a fresh public source tree, excluding private data and Git history."""
import argparse
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {
    'README.md', 'LICENSE', 'DATA_POLICY.md', 'TRADEMARKS.md',
    'THIRD_PARTY_NOTICES.md', 'CONTRIBUTING.md', 'SECURITY.md', '.gitignore',
    '.env.ai-review.example',
}
CF_ROOT = {'package.json', 'package-lock.json', 'wrangler.jsonc', 'vite.config.ts',
           'tsconfig.json', 'worker-configuration.d.ts', 'components.json',
           'README.md', '.gitignore', '.dev.vars.example'}
BLOCKED = {'node_modules', '.git', '.local', '.runtime', '.collection', '.generated',
           '.wrangler', '__pycache__', '.DS_Store'}
GITHUB_FILES = {
    '.github/workflows/quality.yml', '.github/PULL_REQUEST_TEMPLATE.md',
    '.github/ISSUE_TEMPLATE/config.yml', '.github/ISSUE_TEMPLATE/bug_report.yml',
    '.github/ISSUE_TEMPLATE/collector_adapter.yml', '.github/ISSUE_TEMPLATE/feature_request.yml',
}


def included(path):
    if any(part in BLOCKED for part in path.parts) or path.suffix == '.pyc':
        return False
    name = path.as_posix()
    if name in ROOT_FILES:
        return True
    if len(path.parts) < 2:
        return False
    top, *rest = path.parts
    if top == '.github':
        return name in GITHUB_FILES
    if top == 'config':
        return len(rest) == 1 and rest[0] in {'site.json', 'catalog.json', 'sources.example.json', 'collector.example.json'}
    if top == 'collector':
        return path.suffix == '.py' or (rest[0] == 'prompts' and path.suffix in {'.md', '.json'})
    if top == 'tests':
        return path.suffix == '.py'
    if top == 'scripts':
        return name == 'scripts/export_public.py'
    if top == 'ops':
        return name in {'ops/github-actions/collect.yml', 'ops/github-actions/official-prices.yml', 'ops/github-actions/requirements.txt'}
    if top == 'public-docs':
        return path.suffix == '.md' or name in {'public-docs/images/demo-desktop.png', 'public-docs/images/demo-mobile.png'}
    if top == 'cloudflare':
        return (len(rest) == 1 and rest[0] in CF_ROOT) or rest[0] in {'src', 'shared', 'web', 'scripts', 'tests', 'migrations'}
    return False


def export_public(source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination == source or source in destination.parents:
        raise ValueError('Export destination must be outside the source repository')
    if destination.exists():
        raise ValueError('Export destination already exists; refusing to overwrite it')
    if not (source / 'LICENSE').is_file():
        raise ValueError('Choose a license before preparing a public release')
    files = [p for p in source.rglob('*') if p.is_file() and included(p.relative_to(source))]
    # rglob sees ignored trees too, but never selects them. Do not follow links
    # that could smuggle private files under an otherwise allowed source path.
    for path in files:
        relative = path.relative_to(source)
        if any((source / Path(*relative.parts[:i])).is_symlink() for i in range(1, len(relative.parts) + 1)):
            raise ValueError('Symlink in public export: ' + str(relative))
    destination.mkdir(parents=True)
    for path in files:
        target = destination / path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
    public_agents = destination / 'public-docs/AGENTS.md'
    if public_agents.exists():
        shutil.copy2(public_agents, destination / 'AGENTS.md')
    return len(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT.parent / 'output/aibibi-public')
    args = parser.parse_args()
    try:
        count = export_public(ROOT, args.output)
    except ValueError as error:
        parser.exit(2, str(error) + '\n')
    print(json.dumps({'output': str(args.output.resolve()), 'files': count, 'git_history_included': False}))


if __name__ == '__main__':
    main()
