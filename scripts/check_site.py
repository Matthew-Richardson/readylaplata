"""Validate local page dependencies, unique IDs, JSON, and JavaScript syntax.
Run: python scripts/check_site.py (requires Node.js for syntax checks).
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path, self.ids, self.scripts = path, set(), []
        self.inline = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            assert attrs['id'] not in self.ids, f'{self.path.name}: duplicate ID {attrs["id"]}'
            self.ids.add(attrs['id'])
        for name in ('src', 'href', 'data-src'):
            ref = attrs.get(name, '')
            parts = urlsplit(ref)
            if not ref or ref.startswith(('#', '//')) or parts.scheme:
                continue
            target = (self.path.parent / unquote(parts.path)).resolve()
            assert target.is_file(), f'{self.path.name}: missing local asset {ref}'
        if tag == 'script' and not attrs.get('src') and attrs.get('type', '') not in ('application/json', 'application/ld+json'):
            self.inline = []

    def handle_data(self, data):
        if self.inline is not None:
            self.inline.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.inline is not None:
            self.scripts.append(''.join(self.inline))
            self.inline = None


def main():
    pages = sorted(ROOT.glob('*.html'))
    with tempfile.TemporaryDirectory() as temp:
        for path in pages:
            page = Page(path)
            page.feed(path.read_text(encoding='utf-8'))
            for index, script in enumerate(page.scripts):
                filename = Path(temp) / f'{path.stem}-{index}.js'
                filename.write_text(script, encoding='utf-8')
                subprocess.run(['node', '--check', str(filename)], check=True)
    for path in ROOT.glob('*.js'):
        subprocess.run(['node', '--check', str(path)], check=True)
    for path in ROOT.glob('*.json'):
        json.loads(path.read_text(encoding='utf-8-sig'))
    print(f'PASS: {len(pages)} pages, local dependencies, unique IDs, JSON, and JavaScript syntax.')

if __name__ == '__main__':
    main()
