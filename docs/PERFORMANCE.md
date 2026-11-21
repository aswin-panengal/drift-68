# Performance and release measurements

Measured 2026-11-19 on Windows. Node 24.14.1, VS Code 1.146.0 and Playwright Chromium. The browser reports **ANGLE / Vulkan SwiftShader (Subzero)**: this is software rendering, not a hardware-GPU benchmark. The frame-rate targets are targets, not guaranteed performance.

## Rendering

Reproduce with `npm run dev` and `python scripts/profile_browser.py`. Each mode warms for eight seconds, then counts actual rendered frames and fixed simulation steps for 2.5 seconds. The final measurements ran without the separate VS Code UI test competing for rendering resources. Auto resolution can continue adapting after this sample.

| Mode | CSS viewport | Internal pixels at sample | Render FPS | Simulation Hz |
| --- | --- | --- | --- | --- |
| Sidebar, Auto | 300 × 600 | 255 × 510 | 30.0 | 60.0 |
| Editor, Auto | 1200 × 800 | 840 × 560 | 15.3 | 60.4 |
| Maximized, Auto | 1600 × 1000 | 960 × 600 | 14.5 | 60.1 |
| Editor, Low | 1200 × 800 | 612 × 408 | 26.4 | 59.9 |

On this machine the sidebar meets its target; the larger views miss 30–60 FPS. Low or a smaller group is recommended on software rendering. No hardware performance claim is made. The fixed timestep remains 60 Hz; its catch-up cap intentionally drops elapsed time on extreme stalls rather than running an expensive backlog.

The default Coastal scene at the starting line uses **48 draw calls, 22,874 triangles, 41 GPU geometries, zero image textures**. Instanced trees/rocks/barriers/dashes/start tiles and pooled effects keep costs bounded. Material batching and simple Lambert lighting reduced the initial roughly 81 calls and expensive PBR shading. The earlier PBR sample measured roughly 6.6 FPS in the editor; the final sample measured 15.3 FPS. These are observed runs, not a controlled cross-device comparison.

## Actual process memory

Measurements use Windows process RSS and private bytes through psutil, including browser/renderer/GPU/utility processes. These numbers are **not JavaScript heap**. Process private bytes include committed native allocations; RSS sums can double-count shared pages.

The standalone development browser's summed private bytes were 87.4 MiB idle, 214.6 MiB in Sidebar, 211.6 MiB in Editor, 221.1 MiB maximized, and 211.0 MiB in Low. The observed active delta was around **124–134 MiB**, exceeding the preferred additional-memory target of 100 MB. Hiding removed the canvas and produced **zero simulation updates in one second**. Driver/browser caches need not immediately return process memory to the OS.

The actual production extension was also exercised in a disposable VS Code workbench. Summed private bytes for the entire launched Code process tree were:

| Stage | Private MiB |
| --- | --- |
| Cold workbench baseline | 679.7 |
| Game title | 1275.0 |
| Editor driving | 1213.2 |
| Source editor / game hidden | 1274.5 |
| Sidebar driving | 1300.9 |
| After four round-trip view transfers | 1345.2 |

This includes Code startup, built-in services, extension host, DevTools connection and GPU/native memory. It is not an isolated causal measurement of game memory. The higher hidden reading and changing utility-process allocations show why subtracting the cold baseline and calling it “Webview memory” would be misleading. This environment does **not** establish compliance with the preferred 100 MB goal. A warm workbench, hardware GPU and longer soak need profiling before claiming that budget or a long-term native-memory plateau.

## Suspension and bounded resources

- No canvas before the player deliberately opens the game.
- Menus and pause have no animation loop; hidden/disposed/released views remove the canvas, cancel RAF, clear keys and stop engine/tire audio.
- Real workbench tests found exactly one game canvas across sidebar and editor after a transfer.
- Eighteen repeated circuit loads repeated geometry counts **41 / 35 / 33**, rather than increasing. Development JS heap was around 19 MB in the shorter load test; this is reported separately and is not a full-memory claim.
- Context loss/restoration was exercised against the actual WebGL renderer; recovery remained paused and rendered again without JavaScript errors.
- Short tests cannot prove the absence of all driver/native leaks. Long-run testing remains unchecked in ACCEPTANCE.md.

## Release

Production webview JavaScript is approximately 560 KB uncompressed (148 KB gzip), CSS 15 KB, and the local variable font 20 KB. The extension host is separately bundled; runtime node_modules, source maps, tests and dev tools are excluded from the VSIX.

`npm run package` succeeded with official vsce 4.1.1. The historical 1.0.0 VSIX is approximately **850 KiB**, including screenshots and documentation, well below the 15 MB size target. The archive contains the host bundle, game JS/CSS, font/license and original icon; inspection found no node_modules, tests or source maps.

The VSIX was successfully installed with `code --install-extension` into a disposable extensions directory. The official Extension Development Host suite then ran against that **installed extension directory**, including activation, real scene initialization acknowledgement, Explorer/editor transfer, singleton panel, maximize/restore, disposal/reopening and real globalState storage. All checks passed with exit code 0. A final docs-only repack verifies matching hashes for all runtime assets against that installed, tested build. The user's regular VS Code extension directory was not modified.

Raw reproducible artifacts: `test-results/profile.json`, `browser-metrics.json`, `extension-ui-results.json`, `extension-results.json` and associated logs/screenshots. Diagnostics are development-only and disabled in the production bundle. No Marketplace publication was performed.
