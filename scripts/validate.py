"""Dependency-free structural checks. Run from any directory with Python 3."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib
import json
import re
import struct
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'
ANDROID = ROOT / 'android/app/src/main'
checks = 0


def check(condition, message):
    global checks
    if not condition:
        raise AssertionError(message)
    checks += 1


def exists(path):
    check(path.is_file(), f'Missing file: {path.relative_to(ROOT)}')


class References(HTMLParser):
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ('src', 'href') and value and value.startswith('./'):
                target = WEB / value
                if target.is_dir():
                    target /= 'index.html'
                exists(target)


References().feed((WEB / 'index.html').read_text(encoding='utf-8'))
for module in (WEB / 'js').glob('*.js'):
    for imported in re.findall(r"from ['\"](\.[^'\"]+)['\"]", module.read_text(encoding='utf-8')):
        exists(module.parent / imported)

manifest = json.loads((WEB / 'manifest.json').read_text(encoding='utf-8'))
check(manifest['start_url'] == manifest['scope'] == manifest['id'] == './', 'Manifest must support subpaths')
check(manifest['display'] == 'standalone', 'Manifest must be standalone')
for icon in manifest['icons'] + [{'src': './assets/icons/apple-touch-icon.png', 'sizes': '180x180'}]:
    path = WEB / icon['src']
    exists(path)
    data = path.read_bytes()
    check(data[:8] == b'\x89PNG\r\n\x1a\n', f'Invalid PNG: {path}')
    actual = struct.unpack('>II', data[16:24])
    check(actual == tuple(map(int, icon['sizes'].split('x'))), f'Wrong icon dimensions: {path}')

worker = (WEB / 'service-worker.js').read_text(encoding='utf-8')
shell = re.search(r'const SHELL = \[(.*?)\]', worker, re.S).group(1)
for asset in re.findall(r"'(\./[^']*)'", shell):
    target = WEB / asset
    exists(target / 'index.html' if target.is_dir() else target)
check("register('./service-worker.js'" in (WEB / 'js/app.js').read_text(encoding='utf-8'), 'Wrong worker registration')
config = (WEB / 'js/config.js').read_text(encoding='utf-8')
check(len(re.findall(r'^\s*chatgptUrl:\s*"[^"\r\n]*"\s*,?\s*$', config, re.M)) == 1, 'Android-readable URL setting required')

ns = '{http://schemas.android.com/apk/res/android}'
manifest_root = ET.parse(ANDROID / 'AndroidManifest.xml').getroot()
check(not manifest_root.findall('uses-permission'), 'Native launcher should need no permissions')
app = manifest_root.find('application')
check(app.attrib[ns + 'label'] == '@string/app_name', 'Incorrect native label')
activity = app.find('activity')
check(activity.attrib[ns + 'name'] == '.MainActivity', 'Incorrect activity class')
check(activity.attrib[ns + 'exported'] == 'true', 'Launcher must be exported')

resources = set()
for xml in (ANDROID / 'res').rglob('*.xml'):
    tree = ET.parse(xml)
    if xml.parent.name.startswith('values'):
        for value in tree.getroot():
            resources.add((value.tag, value.attrib.get('name')))
    else:
        resources.add((xml.parent.name.split('-')[0], xml.stem))
for png in (ANDROID / 'res').rglob('*.png'):
    resources.add((png.parent.name.split('-')[0], png.stem))
for xml in [ANDROID / 'AndroidManifest.xml', *(ANDROID / 'res').rglob('*.xml')]:
    for kind, name in re.findall(r'@([a-z]+)/([\w.]+)', xml.read_text(encoding='utf-8')):
        check((kind, name) in resources, f'Unresolved XML resource {kind}/{name}')
for kotlin in (ANDROID / 'java').rglob('*.kt'):
    source = kotlin.read_text(encoding='utf-8')
    check(source.startswith('package com.viraj.aibuddy'), f'Incorrect Kotlin package: {kotlin}')
    for kind, name in re.findall(r'\bR\.(\w+)\.(\w+)', source):
        check((kind, name) in resources, f'Unresolved Kotlin resource {kind}/{name}')
build = (ROOT / 'android/app/build.gradle.kts').read_text(encoding='utf-8')
check('namespace = "com.viraj.aibuddy"' in build, 'Wrong namespace')
check('applicationId = "com.viraj.aibuddy"' in build, 'Wrong application ID')
check('../web/js/config.js' in build and 'CHATGPT_URL' in build, 'Missing shared destination integration')
for wrapper in ['gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.properties', 'gradle/wrapper/gradle-wrapper.jar']:
    exists(ROOT / 'android' / wrapper)
wrapper_sha = hashlib.sha256((ROOT / 'android/gradle/wrapper/gradle-wrapper.jar').read_bytes()).hexdigest()
check(wrapper_sha == '2db75c40782f5e8ba1fc278a5574bab070adccb2d21ca5a6e5ed840888448046', 'Unexpected Gradle 8.11.1 wrapper checksum')

# Check local documentation links so installation instructions stay navigable.
for md in [ROOT / 'README.md', WEB / 'README.md', *(ROOT / 'docs').glob('*.md')]:
    for target in re.findall(r'\]\(([^)#]+)(?:#[^)]*)?\)', md.read_text(encoding='utf-8')):
        if '://' not in target:
            exists((md.parent / target).resolve())
print(f'PASS: {checks} structural checks (web references, icons, PWA, Android resources, shared config, wrapper, docs).')
print('These checks do not compile Kotlin or replace physical-device testing.')
