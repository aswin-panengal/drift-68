# Known limitations and verification boundaries

- Software rendering is usable in a small sidebar but misses larger-view FPS targets on the tested SwiftShader machine. Hardware-accelerated Windows/macOS/Linux performance has not been measured. Use Low graphics or a smaller editor group on software-only systems.
- The preferred additional-memory target below 100 MB was not demonstrated. Process measurements include GPU/native allocations and are reported in PERFORMANCE.md. JavaScript heap is not a proxy for full Webview memory.
- Repeated short tests show bounded GPU geometry and one active canvas. They do not establish an hours-long absence of all native/driver leaks. A longer soak remains unverified.
- Keyboard typing and copy/paste were exercised in a real isolated VS Code workbench on Windows. Multi-monitor scaling, macOS/Linux shortcuts, screen readers and physical gamepads remain manual checks. The gamepad-disconnection event path is automated; physical controller mapping is not.
- Audio synthesis and user-gesture unlock are implemented and exercised without browser exceptions. Perceived sound balance and physical output-device changes need listening tests. Sound defaults off. Engine and tire audio suspend with gameplay; deliberate menu clicks and results can play short UI cues.
- Collision is an arcade course-boundary response with off-road slowdown. Scenery is decorative; this is not a rigid-body collision simulation. Tracks have flat driving surfaces with dimensional hills, mountains and coastal cliffs around them.
- Maximize uses VS Code's editor-group command and restores the saved group layout. With only one editor group already filling the area, the size difference may be small. It deliberately preserves sidebar/panel visibility. Older VS Code builds without the command receive an explanatory message.
- Explorer section height is controlled by VS Code. Drag its upper divider for room to play; around 360–600 pixels is comfortable. Very short sections require menu scrolling. The compact garage reserves a genuine 3D preview above its controls.
- A paused/hidden view reconstructs from a versioned snapshot. Hard application crashes can lose up to roughly two seconds of unsaved driving, while already saved records/preferences remain in global storage. An unresponsive transfer fails closed and offers recovery by closing the stale view.

See ACCEPTANCE.md for earlier solo verification. Multiplayer depends on room server availability and account capacity. The relay accepts client finish reports, so races are designed for casual play with friends.
