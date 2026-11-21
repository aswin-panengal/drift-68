"""Build the GitHub release archives with stable paths, permissions and timestamps."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory
from zipfile import ZipFile, ZipInfo


WEB_FILES = {
    'game.js', 'index.css', 'index.html', 'Outfit.woff2', 'OFL-Outfit.txt',
    'drift-cover.webp', 'drift-cover-portrait.webp', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
}
VSIX_FILES = {
    '[Content_Types].xml', 'extension.vsixmanifest', 'extension/package.json',
    'extension/readme.md', 'extension/LICENSE.txt', 'extension/THIRD_PARTY_NOTICES.md',
    'extension/media/icon.png', 'extension/media/drift.svg', 'extension/dist/extension.cjs',
    'extension/docs/ACCEPTANCE.md', 'extension/docs/ARCHITECTURE.md',
    'extension/docs/KNOWN_LIMITATIONS.md', 'extension/docs/MULTIPLAYER.md',
    'extension/docs/PERFORMANCE.md', 'extension/docs/screenshots/rear-chase.png',
    'extension/docs/screenshots/title.png',
} | {f'extension/dist/webview/{file}' for file in WEB_FILES - {'LICENSE', 'THIRD_PARTY_NOTICES.md'}}


def write_archive(path, files):
    # Store entries without compression so the output is independent of the zlib version.
    with ZipFile(path, 'w') as archive:
        for name, content in sorted(files.items()):
            entry = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, content)


def check_contents(label, actual, expected):
    if set(actual) != expected or len(actual) != len(expected):
        raise SystemExit(f'{label} contents differ. Missing {sorted(expected - set(actual))}; '
                         f'unexpected {sorted(set(actual) - expected)}; duplicate entries {len(actual) != len(set(actual))}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--tag', help='Verify the release tag matches package.json')
    args = parser.parse_args()

    manifest = json.loads(Path('package.json').read_text(encoding='utf-8'))
    lock_root = json.loads(Path('package-lock.json').read_text(encoding='utf-8'))['packages']['']
    version = manifest['version']
    if (manifest['name'], manifest['publisher']) != ('drift-68', 'aswin-dev') or lock_root['name'] != manifest['name']:
        raise SystemExit('Expected the Drift 68 Marketplace identity in manifest and lockfile')
    if not re.fullmatch(r'\d+\.\d+\.\d+', version) or lock_root['version'] != version:
        raise SystemExit('Expected the same stable release version in the manifest and lockfile')
    tag = f'v{version}'
    if args.tag and args.tag != tag:
        raise SystemExit(f'Expected tag {tag}, got {args.tag}')

    with TemporaryDirectory(prefix='drift-vsix-') as temp:
        raw_vsix = Path(temp) / 'extension.vsix'
        subprocess.run(['node', 'node_modules/@vscode/vsce/vsce', 'package', '--no-dependencies',
                        '--githubBranch', tag, '--out', str(raw_vsix)], check=True)
        with ZipFile(raw_vsix) as archive:
            check_contents('VSIX', archive.namelist(), VSIX_FILES)
            vsix = {name: archive.read(name) for name in archive.namelist()}
    packaged = json.loads(vsix['extension/package.json'])
    if any(packaged[key] != manifest[key] for key in ('name', 'publisher', 'version')):
        raise SystemExit('VSIX identity differs from package.json')

    web_root = Path('dist/webview')
    web_files = [path.relative_to(web_root).as_posix() for path in web_root.rglob('*') if path.is_file()]
    check_contents('Browser archive', web_files, WEB_FILES)
    web = {name: (web_root / name).read_bytes() for name in web_files}
    if b'__drift' in web['game.js'] or any(web[name] != vsix[f'extension/dist/webview/{name}']
                                        for name in WEB_FILES - {'LICENSE', 'THIRD_PARTY_NOTICES.md'}):
        raise SystemExit('Expected matching production webview files in both archives')
    if web['LICENSE'] != vsix['extension/LICENSE.txt'] or web['THIRD_PARTY_NOTICES.md'] != vsix['extension/THIRD_PARTY_NOTICES.md']:
        raise SystemExit('Expected matching license and notices in both archives')

    notices = web['THIRD_PARTY_NOTICES.md']
    for required in (
        b'three.js authors', b'VoidZero Inc. and Vite contributors',
        b'The Outfit Project Authors', b'SIL OPEN FONT LICENSE',
    ):
        if required not in notices or required not in web['game.js']:
            raise SystemExit(f'Missing runtime attribution in shipped notices: {required!r}')

    args.output.mkdir(parents=True, exist_ok=True)
    outputs = [(f'drift-68-{version}.vsix', vsix), (f'drift-68-web-{version}.zip', web)]
    checksums = []
    for name, files in outputs:
        path = args.output / name
        write_archive(path, files)
        checksums.append(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {name}\n')
    (args.output / 'SHA256SUMS.txt').write_text(''.join(checksums), encoding='ascii', newline='\n')
    print(''.join(checksums), end='')


if __name__ == '__main__':
    main()
