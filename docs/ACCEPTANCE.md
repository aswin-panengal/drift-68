# Acceptance checklist

Verified on Windows, Node 24.14.1, VS Code 1.146.0, Chromium Playwright, 2026-11-19. Tests actually executed; no screenshot is used as proof of simulation correctness.

- [x] Strict TypeScript and production Vite/esbuild build.
- [x] 49 Vitest tests: drift thresholds/points/multiplier/banking/collisions, spin and reverse rejection, ordered forward crossings, one-lap completion, reset, deterministic fixed-step results at 30/60/144 render schedules, finite boost, storage/corruption handling and message validation.
- [x] Continuous simulated driving completes all 12 car/circuit combinations without teleporting; browser constructs and renders every combination.
- [x] Host coordinator tests: snapshot transfer, stale generations, timeout/rejected transport failing closed, disposal, hidden destinations and same-view reconstruction.
- [x] Browser: loading/title/garage/circuits/drive/pause/settings/results, 240px responsive views, score record surviving reload, Zen crossing without results, settings storage, real acceleration/sliding, focus/shortcut gating, pointer exit, disconnection event and visibility suspension.
- [x] Browser: zero canvases before explicit open; no simulation updates after suspension; context loss/restoration; 18 track reloads retain bounded geometry; no external runtime requests or JavaScript errors.
- [x] Actual Extension Development Host: activation; Explorer Webview; singleton editor; maximize and restore with identical editor layout; bidirectional snapshot transfer; source tab hiding; closing and reopening; globalState best-score comparison/reset.
- [x] Actual production Webview in an isolated workbench: CSP/local script/style/font load, keyboard acceleration, source typing including WASD, Ctrl+C/Ctrl+V, return to paused drive, one canvas across simultaneous view surfaces, repeated mode transfers.
- [x] Runtime license inventory, original procedural assets, local font license and npm audit with zero advisories after a build-tool dependency override.
- [x] Process memory and renderer profiling performed; preferred memory and larger-view FPS targets were missed on software rendering, not marked as passed.

Release packaging and install smoke evidence is recorded in PERFORMANCE.md. `npm run test:browser`, `npm run test:extension`, `npm run test:workbench -- <vsix>`, and `python scripts/profile_browser.py` write their evidence under `test-results/`. The screenshots in `docs/screenshots/` are maintained separately.

## Version 1.1.0

- [x] 52 unit tests pass. The new tests cover holding a powered slide after a handbrake tap, recovering with countersteering or reduced throttle, detecting tire slip, and reading the rear chase preference from a version-one save.
- [x] Browser checks verify **C** selects a perspective camera behind the car, the setting survives reload, and tire smoke and marks follow a slide. The chase view keeps the car in frame at 240 px, where smoke also renders during Zen Drive on Low graphics.
- [x] The full lap simulations still complete for all 12 car and circuit pairings. Browser WebGL context recovery, view disposal, and bounded scene geometry checks pass.
- [x] The 1.1.0 VSIX installed in a disposable VS Code profile and passed the Extension Development Host tests. The workbench test verified keyboard camera cycling and confirmed that the rear chase preference transfers from the editor to Explorer.

## Manual checks still required

- [ ] Windows/macOS/Linux hardware GPU: Sidebar 30 FPS and editor/maximized 30–60 FPS; process memory delta under a representative warm workbench workload.
- [ ] At least 30 minutes of circuit changes, resets, laps and view switches; check process/GPU memory returns to a bounded plateau.
- [ ] Multiple monitors at 100%, 150%, 200% scaling: resize, move the window and inspect car/HUD framing.
- [ ] Physical standard-mapping controller: connect while paused, click viewport, triggers/steering/A/B/Start, unplug while accelerating; no movement after focus loss.
- [ ] Listen on headphones/speakers: engine acceleration, slip, selection and finish cues; volume and sound off; no engine/tire sound while coding.
- [ ] Subjective handling review: release Space to recover, countersteer, brake/reverse, boost, reset; all four personalities should be enjoyable.
- [ ] Screen-reader and high-contrast-theme review; full keyboard navigation through every menu.

For manual view testing: F5 → Explorer → Drift Break → open → select content → click road. Expand, click a source tab, type `wasd r c`, copy/paste, return and verify paused. Maximize/restore with two split editor groups. Collapse/reopen Explorer, close/reopen the game, then move focus to a terminal or chat. No gameplay key should be consumed outside the clicked viewport. Production has no global driving keybindings.
