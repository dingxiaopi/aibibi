"""Authenticated encryption for a private collector state repository.

Keys are read only from COLLECTOR_STATE_KEY. Only explicitly listed data files
are stored; credentials, source code, Git metadata and arbitrary paths are excluded.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
from urllib.parse import urlsplit
import zlib

MAGIC = b'AIBIBI-STATE\x01'
LIMIT = 64 * 1024 * 1024
FILES = (
    'instance.json', 'seeds.json', 'snapshot.json', 'runtime/prices.sqlite3',
    'collection/collect-checkpoint.json', 'collection/update-state.json',
    'collection/push-progress.json', 'collection/push.log', 'collection/update.log',
    'collection/sync-state.json', 'collection/actions.log', 'collection/actions-summary.json',
    'exports/external-batch.json',
)
REQUIRED = {'instance.json', 'seeds.json', 'snapshot.json'}


class StateError(ValueError):
    pass


def key_from_env():
    try:
        key = base64.b64decode(os.environ.get('COLLECTOR_STATE_KEY', ''), validate=True)
    except ValueError:
        raise StateError('Invalid collector state key') from None
    if len(key) != 32:
        raise StateError('Collector state key must encode 32 random bytes')
    return key


def context(profile):
    if profile not in ('sample', 'production'):
        raise StateError('Unknown state profile')
    return MAGIC + b'/' + profile.encode('ascii')


def validate_files(files, profile):
    if not REQUIRED.issubset(files) or any(name not in FILES for name in files):
        raise StateError('Missing required state or unsupported file path')
    if sum(len(value) for value in files.values()) > LIMIT:
        raise StateError('Collector state exceeds size limit')
    try:
        instance = json.loads(files['instance.json'])
        seeds = json.loads(files['seeds.json'])
        snapshot = json.loads(files['snapshot.json'])
        if (instance.get('profile') != profile or instance.get('version') != 1 or
                not isinstance(instance.get('target'), str) or
                not isinstance(seeds.get('shops'), list) or
                not isinstance(seeds.get('mappings'), dict) or
                not isinstance(snapshot.get('quotes'), list)):
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise StateError('Invalid collector state content') from None


def history_bytes(path):
    """Keep all real observations, but only the latest redundant full snapshot.

    Compaction is applied to a temporary SQLite backup, never to the operator's DB.
    """
    with tempfile.TemporaryDirectory() as temporary:
        copy = Path(temporary) / 'history.sqlite3'
        try:
            with sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True) as source:
                with sqlite3.connect(copy) as destination:
                    source.backup(destination)
                    if destination.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshots'").fetchone():
                        destination.execute('DELETE FROM snapshots WHERE at NOT IN (SELECT at FROM snapshots ORDER BY at DESC LIMIT 1)')
                        destination.commit()
                    destination.execute('VACUUM')
        except sqlite3.DatabaseError:
            raise StateError('Invalid history database') from None
        if copy.stat().st_size > LIMIT:
            raise StateError('History database exceeds state size limit')
        return copy.read_bytes()


def seal(directory, archive, profile, key):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    if Path(directory).is_symlink():
        raise StateError('State directory cannot be a symlink')
    directory, archive = Path(directory).resolve(), Path(archive)
    files = {}
    for name in FILES:
        path = directory / name
        if not path.exists():
            continue
        relative = Path(name)
        if any((directory / Path(*relative.parts[:i])).is_symlink()
               for i in range(1, len(relative.parts) + 1)):
            raise StateError('Symlinks cannot enter collector state')
        if name != 'runtime/prices.sqlite3' and path.stat().st_size > LIMIT:
            raise StateError('Collector file exceeds size limit')
        value = history_bytes(path) if name == 'runtime/prices.sqlite3' else path.read_bytes()
        # Long diagnostics are expendable; checkpoints and snapshots are not.
        if name.endswith('.log'):
            value = value[-2 * 1024 * 1024:]
        files[name] = value
    validate_files(files, profile)
    payload = json.dumps({'version': 1, 'files': {
        name: base64.b64encode(value).decode('ascii') for name, value in files.items()
    }}, separators=(',', ':')).encode()
    if len(payload) > LIMIT:
        raise StateError('Encoded state exceeds size limit')
    nonce = os.urandom(12)
    encrypted = MAGIC + nonce + AESGCM(key).encrypt(nonce, zlib.compress(payload), context(profile))
    archive.parent.mkdir(parents=True, exist_ok=True)
    temporary = archive.with_suffix(archive.suffix + '.tmp')
    temporary.write_bytes(encrypted)
    temporary.replace(archive)
    return len(files)


def restore(archive, directory, profile, key):
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    archive, directory = Path(archive), Path(directory)
    if archive.stat().st_size > LIMIT:
        raise StateError('Encrypted state exceeds size limit')
    blob = archive.read_bytes()
    if not blob.startswith(MAGIC) or len(blob) < len(MAGIC) + 28:
        raise StateError('Unsupported encrypted state')
    offset = len(MAGIC)
    try:
        compressed = AESGCM(key).decrypt(blob[offset:offset + 12], blob[offset + 12:], context(profile))
        decompressor = zlib.decompressobj()
        payload = decompressor.decompress(compressed, LIMIT + 1)
        if len(payload) > LIMIT or not decompressor.eof or decompressor.unused_data:
            raise StateError('Invalid compressed state or size limit exceeded')
        envelope = json.loads(payload)
        if envelope.get('version') != 1 or not isinstance(envelope.get('files'), dict):
            raise StateError('Unsupported state envelope')
        files = {name: base64.b64decode(value, validate=True) for name, value in envelope['files'].items()}
    except InvalidTag:
        raise StateError('State authentication failed; refusing to restore or overwrite it') from None
    except (zlib.error, ValueError, TypeError, AttributeError):
        raise StateError('Invalid encrypted state payload') from None
    validate_files(files, profile)
    # Restoration only targets a fresh work directory; validate all paths before writing.
    if directory.exists() and any(directory.iterdir()):
        raise StateError('Restore directory is not empty')
    if directory.is_symlink():
        raise StateError('Restore directory cannot be a symlink')
    for name, value in files.items():
        path = directory / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(value)
    return len(files)


def prepare(directory, archive, profile, key, target):
    """Seed a new encrypted profile without changing the local collector files."""
    directory, archive = Path(directory), Path(archive)
    if directory.is_symlink():
        raise StateError('Source directory cannot be a symlink')
    directory = directory.resolve()
    url = urlsplit(target)
    if (url.scheme != 'https' or not url.hostname or url.username or url.password or
            url.path not in ('', '/') or url.query or url.fragment):
        raise StateError('Target must be an HTTPS origin')
    if archive.exists():
        raise StateError('A new profile must not overwrite an existing archive')
    with tempfile.TemporaryDirectory() as temporary:
        work = Path(temporary)
        for name in FILES:
            source = directory / name
            if name == 'instance.json' or not source.exists():
                continue
            relative = Path(name)
            if any((directory / Path(*relative.parts[:i])).is_symlink()
                   for i in range(1, len(relative.parts) + 1)):
                raise StateError('Source data must not contain symlinks')
            destination = work / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
        (work / 'instance.json').write_text(json.dumps({'version': 1, 'profile': profile, 'target': target.rstrip('/')}))
        return seal(work, archive, profile, key)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['prepare', 'seal', 'restore'])
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--profile', choices=['sample', 'production'], required=True)
    parser.add_argument('--target', help='HTTPS instance origin, required when preparing a new profile')
    args = parser.parse_args()
    try:
        key = key_from_env()
        if args.command == 'prepare':
            count = prepare(args.directory, args.archive, args.profile, key, args.target or '')
        elif args.command == 'seal':
            count = seal(args.directory, args.archive, args.profile, key)
        else:
            count = restore(args.archive, args.directory, args.profile, key)
            output = os.environ.get('GITHUB_OUTPUT')
            if output:
                with open(output, 'a') as file:
                    file.write('restored=true\n')
        print(json.dumps({'state': args.command, 'profile': args.profile, 'files': count}))
    except (StateError, OSError):
        # Do not print arbitrary filenames, decrypted contents or credentials to Actions logs.
        parser.exit(2, 'Collector state operation failed; encrypted state was not replaced.\n')


if __name__ == '__main__':
    main()
