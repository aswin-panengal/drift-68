"""Capture the title backdrop from the local game renderer.

Run a local Vite dev server, then invoke this script with its loopback URL.
Requires Playwright Chromium and Pillow.
"""

import argparse
from base64 import b64decode
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url', help='Local Vite dev server URL')
    parser.add_argument('--output', type=Path, default=Path('public/drift-cover.webp'))
    args = parser.parse_args()
    if urlsplit(args.url).hostname not in ('127.0.0.1', 'localhost', '::1'):
        parser.error('Use a loopback Vite dev server')

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1480, 'height': 880}, device_scale_factor=1)
        page.goto(args.url, wait_until='networkidle')
        page.get_by_role('button', name='Play', exact=True).click()
        page.get_by_role('button', name='Solo', exact=True).click()
        page.get_by_role('button', name='Head to the start', exact=True).click()
        png = page.evaluate("""() => {
            const game = window.__drift;
            const {renderer: view, state} = game;
            const path = game.simulation.path;
            const point = path.samples[411];
            const {x, z, tx, tz} = point;
            view.configure({...state.settings, quality: 'high'}, 'editor');
            view.car.update({...state.vehicle, x, z, heading: Math.atan2(tx, tz)}, 0, true);
            view.sun.target.position.set(x, 0, z);
            view.sun.position.set(x + 60, 110, z + 40);

            const camera = view.rearCamera;
            camera.fov = 49;
            camera.updateProjectionMatrix();
            camera.position.set(x + tx * 8 - tz * 4.8, 4.5, z + tz * 8 + tx * 4.8);
            camera.lookAt(x - tx * 3 - tz * 1.8, 1.1, z - tz * 3 + tx * 1.8);
            view.renderer.render(view.scene, camera);
            return view.renderer.domElement.toDataURL('image/png').split(',')[1];
        }""")
        browser.close()

    with Image.open(BytesIO(b64decode(png))) as capture:
        capture.convert('RGB').save(args.output, format='WEBP', quality=88, method=6)


if __name__ == '__main__':
    main()
