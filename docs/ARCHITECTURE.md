# Architecture

The extension host owns a versioned persistence store and a GameSessionCoordinator. The coordinator grants one Webview a session lease. A transfer first revokes the old lease, waits for a suspended snapshot acknowledgement, then initializes the destination. A timeout fails closed and retains the last validated snapshot. A generation token rejects late messages. Ready does not mean play: the player must click the viewport.

The browser owns pure fixed-step simulation, deterministic sampled spline tracks, scoring, ordered plane-crossing checkpoints, and a lazily allocated Three.js scene. Menus render a single still on demand; paused/hidden views have no animation loop. Losing focus clears keys and stops audio. Releasing a lease disposes GPU resources. Scene objects never cross the message boundary.

Modules: shared contracts/validation/storage; extension view/panel/coordinator; game simulation, vehicle, tracks, scoring, input, audio, renderer, and DOM UI. Procedural original geometry removes asset loading and licensing overhead. All runtime resources are local with strict CSP and narrow resource roots. Development browser mode uses localStorage, production uses globalState.

Maximization uses supported workbench commands discovered through getCommands. The host stores the editor layout and restores it. No native DOM manipulation or operating-system fullscreen.

Reference checks: VS Code Webview guide, contribution points, Views UX guidelines, current @types/vscode, workbench command source, and the gamedev-skills router and Three.js guidance. Exact references and license inventory are in THIRD_PARTY_NOTICES.md.
