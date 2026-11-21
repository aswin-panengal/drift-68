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
    parser.add_argument('--portrait-output', type=Path, default=Path('public/drift-cover-portrait.webp'))
    args = parser.parse_args()
    if urlsplit(args.url).hostname not in ('127.0.0.1', 'localhost', '::1'):
        parser.error('Use a loopback Vite dev server')

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 2400, 'height': 1600}, device_scale_factor=1.5)
        page.goto(args.url, wait_until='networkidle')
        page.get_by_role('button', name='Play', exact=True).click()
        page.get_by_role('button', name='Solo', exact=True).click()
        page.get_by_role('button', name='Next circuit', exact=True).click()
        page.get_by_role('button', name='Head to the start', exact=True).click()
        png = page.evaluate("""async () => {
            const game = window.__drift;
            const {renderer: view, state, simulation} = game;
            const { tireSlip } = await import('/src/game/vehicle/VehiclePhysics.ts');
            const dt = 1 / 60;
            const speed = 16;
            const start = simulation.path.samples[117]; // Approach to the Alpine Pass switchback
            Object.assign(state.vehicle, {
                x: start.x, z: start.z, speed, vx: start.tx * speed, vz: start.tz * speed,
                heading: Math.atan2(start.tx, start.tz),
            });
            state.settings.camera = 1; // Close follow
            view.configure({...state.settings, quality: 'high'}, 'editor');
            view.resetTracking();

            // Start at road speed and drive the switchback with the production
            // simulation, follow camera, and tire smoke renderer.
            const pixelRatio = view.renderer.getPixelRatio();
            view.renderer.setPixelRatio(.25);
            for (let step = 0; step < 39; step++) {
                const handbrake = step < 34;
                simulation.step({steer: handbrake ? .8 : -.3, throttle: 1,
                                 handbrake, brake: 0, boost: false}, dt);
                if (step === 38) view.renderer.setPixelRatio(pixelRatio);
                view.draw(state, dt);
            }
            const {x, z} = state.vehicle;
            if (tireSlip(state.vehicle) < .8 ||
                simulation.path.nearest(x, z).distance > simulation.path.config.width / 2) {
                throw new Error('The cover drift must be on the road with visible tire slip');
            }
            return view.renderer.domElement.toDataURL('image/png').split(',')[1];
        }""")
        browser.close()

    with Image.open(BytesIO(b64decode(png))) as capture:
        for output, bounds in (
            (args.output, (1025, 815, 1965, 1375)),
            (args.portrait_output, (1465, 820, 1945, 1500)),
        ):
            capture.crop(bounds).convert('RGB').save(output, format='WEBP', quality=88, method=6)


if __name__ == '__main__':
    main()
