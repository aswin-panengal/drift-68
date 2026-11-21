# Architecture

The extension host owns a versioned persistence store and a GameSessionCoordinator. The coordinator grants one Webview a session lease. A transfer first revokes the old lease, waits for a suspended snapshot acknowledgement, then initializes the destination. A timeout fails closed and retains the last validated snapshot. A generation token rejects late messages. Ready does not mean play: the player must click the viewport.

The browser owns pure fixed-step simulation, deterministic sampled spline tracks, scoring, ordered plane-crossing checkpoints, and a lazily allocated Three.js scene. Menus render a single still on demand; paused/hidden views have no animation loop. Losing focus clears keys and stops audio. Releasing a lease disposes GPU resources. Scene objects never cross the message boundary.

The extension bundles the game assets locally and restricts the webview to its resource directory and the configured secure room endpoint. Standalone browser saves use `localStorage`. The extension uses VS Code global storage for solo settings, records, and snapshots. Reconnect data stays in memory. The Worker delegates each room to a Durable Object, which stores membership and race state and forwards pose packets between players.

Maximization uses supported workbench commands discovered through getCommands. The host stores the editor layout and restores it. No native DOM manipulation or operating-system fullscreen.

Reference checks: VS Code Webview guide, contribution points, Views UX guidelines, current @types/vscode, workbench command source, and the gamedev-skills router and Three.js guidance. Exact references and license inventory are in THIRD_PARTY_NOTICES.md.
