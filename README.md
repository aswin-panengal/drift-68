# Drift Break

**Code. Drift. Relax.** A small, offline 3D drifting game in VS Code. Take a lap along the coast, find your line in the mountains, or unwind beneath autumn trees.

![Drift Break](docs/screenshots/title.png)

Four original cars, three closed circuits, a one-lap drift challenge, and an endless Zen Drive. Procedural low-poly scenes, synthesized audio, and local records. No accounts, telemetry, remote assets, or access to your source files.

## Install locally

1. In VS Code, open **Extensions → … → Install from VSIX…**.
2. Choose the versioned VSIX produced by `npm run package`.
3. Open **Explorer → Drift Break**, then click **Open Drift Break**. If the view is missing, right-click the Explorer section headings and enable it.

You can also run `code --install-extension "path/to/drift-break-1.1.0.vsix"`.

For comfortable sidebar play, drag the Drift Break section's upper divider to give it around 360–600 pixels of height. VS Code controls this size.

## Take a drive

Choose **Start Drive → car → circuit → Head to the start**, then click the road. Hovering never takes keyboard focus. Menus stay paused until you deliberately resume. The arrow icon opens a single editor tab. The editor has **Maximize / Restore Editor** and **Return to Explorer** controls. Maximization enlarges the editor group inside the workbench; it does not enter OS fullscreen or change your sidebar preferences.

| Input | Action |
| --- | --- |
| W / Up | Accelerate |
| S / Down | Brake, then reverse |
| A / Left, D / Right | Steer |
| Space | Handbrake / initiate a slide |
| Shift | Use earned boost |
| R | Reset to the last ordered checkpoint; clears combo |
| C | Cycle elevated, close, overhead, and rear chase cameras |
| Esc | Pause / close a menu |

Turn in and tap **Space** to start a slide. Keep some throttle on after releasing Space to carry the drift, and steer against the slide or lift off the throttle to regain grip. Rear tires leave tracks and emit more smoke as slip increases, including in Zen Drive. Choose **Rear chase** in Settings or cycle to it with **C** for a view from behind the car.

[Rear chase screenshot](docs/screenshots/rear-chase.png)

Drifting above roughly 25 km/h on the course earns points and boost. Link slides to build a multiplier up to ×5. Straights bank the combo after a short grace period. Major boundary impacts discard unbanked points. Revisiting the same stretch cannot farm more points. Cross all 12 checkpoint gates in order to finish. Records are separate for each car/circuit pair.

Zen Drive has no competitive finish or score display. Standard gamepads use left stick, right trigger for throttle, left trigger for brake, A for handbrake, B for boost, and Start for pause. Polling stops when focus leaves the game.

## A good neighbor to your editor

Driving controls belong only to the clicked game viewport. Pointer exit, focus loss, tab switching, window deactivation, hiding, and menus clear pressed keys and stop simulation/audio. Hidden views release WebGL resources. A host coordinator suspends and snapshots one view before initializing the other. No global driving shortcuts are registered.

Graphics offer Auto, Low, Medium and High. Sidebar play targets 30 FPS with a capped resolution; editor play targets up to 60 FPS. Auto reduces resolution under sustained slow rendering. High enables a small shadow map. Sound defaults off. Settings and best scores live in VS Code global storage, never in your project. Unsupported/corrupt saves recover to defaults. **Reset local records** asks for confirmation.

## Development

Requires Node.js 22.12+ (Node 24 used for verification), npm, and desktop VS Code 1.110+. No backend.

```sh
npm ci
npm test
npm run build
npm run package
```

Press **F5** with the **Run Drift Break** launch configuration for an isolated Extension Development Host. `npm run dev` opens the browser version for local development.

### Test a release build

```sh
python -m pip install playwright psutil
python -m playwright install chromium
npm run test:extension
npm run test:workbench -- drift-break-1.1.0.vsix
```

The workbench suite installs the VSIX into a fresh profile and plays a complete scoring lap with simulated standard gamepad input. It checks keyboard input, view switching, record persistence, and reset confirmation. Reports and screenshots go under `test-results/`. Run `npm run test:browser` with `npm run dev` active for the standalone game suite.

VS Code test runners download the stable desktop build by default. Set `DRIFT_VSCODE_VERSION=1.110.0` to test the minimum supported version, or set `DRIFT_VSCODE_PATH` to an existing desktop executable. `npm run test:extension` uses the built project by default and accepts `DRIFT_EXTENSION_PATH` for an installed package directory.

### Package for the Marketplace

Set `publisher` in `package.json` to the registered Marketplace publisher ID and add the public repository URL. Run `npx vsce package --no-dependencies` to validate the Marketplace build with README link rewriting enabled. [VS Code publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

## Host the browser version

Drift Break runs on a static file host. Run `npm run build` and upload the contents of `dist/webview/` along with `LICENSE` and `THIRD_PARTY_NOTICES.md` from the project root. Browser saves belong to the browser profile and site address. Play requires WebGL 2 and a keyboard or supported gamepad.

Development-only `?debug` enables FPS, frame interval, draw calls, triangles, heap (when available), resolution, view and update counts. Production builds remove the debug probe and overlay activation. Menus render on demand; no hidden high-frequency loop is required.

See [architecture](docs/ARCHITECTURE.md), [acceptance evidence and manual checklist](docs/ACCEPTANCE.md), [performance measurements](docs/PERFORMANCE.md), [known limitations](docs/KNOWN_LIMITATIONS.md), and [third-party notices](THIRD_PARTY_NOTICES.md). Original project code is MIT licensed.
