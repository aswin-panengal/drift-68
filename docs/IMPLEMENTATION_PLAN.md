# Implementation plan

1. Extension shell: contributions, singleton panel, validated protocol, single-owner coordinator, persistence and safe focus lifecycle.
2. Driving: pure fixed 60 Hz physics, four data-driven handling configurations, reset and boundaries.
3. Challenge: deterministic loop, ordered crossing checkpoints, drift banking, results and records; Zen mode.
4. Visuals: procedural low-poly vehicles, sampled roads, instanced scenic environments, bounded effects, responsive menus and HUD.
5. Content: all four cars, all three circuits, garage previews and geometrically matching minimaps.
6. Release: settings, synthesized audio, unit/browser/extension tests, resource measurements, docs, screenshots and local VSIX.

Status and evidence are recorded in ACCEPTANCE.md and PERFORMANCE.md. Untested platform behavior is labelled explicitly, rather than inferred from screenshots.

## Implementation outcome

All six implementation phases have runnable code. Four original car configurations/models, three deterministic circuits, complete menus, challenge/Zen, local persistence, synthesized audio and all three presentation modes are present. Validation found and corrected Escape double handling, paused HUD reconstruction, a lost initialization acknowledgement during focus changes, and same-view reinitialization after VS Code discards hidden Webviews.

The final optimization pass batched car bodies and start tiles, removed default multisampling, used instanced scenery/bounded effects, and replaced PBR with Lambert lighting. The scope is locally packaged, not Marketplace-published. Performance goals and platform/manual checks that remain unmet or unverified are documented rather than represented as completed acceptance.
