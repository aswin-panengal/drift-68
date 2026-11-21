# Drift 68 multiplayer service

The Worker routes each room code to a SQLite-backed Cloudflare Durable Object. Each room keeps membership, circuit, lap count, readiness and the race result. The game runs physics, checkpoints, scoring and rendering locally. The relay forwards up to 10 pose updates per second per standard client. Each pose carries five float32 values for position, heading and velocity. The client interpolates the opponent about 150 ms behind incoming samples and caps extrapolation at 100 ms.

The extension ships with the hosted Drift 68 Worker as its default. Players can create or join rooms right after installing. The steps below cover running a local Worker or using a different deployment.

## Run locally

Run these commands from the repository root. Use a locally trusted TLS certificate so the browser and VS Code webviews can connect over `wss://`. The example uses mkcert to generate a loopback certificate in the ignored `test-results` directory. [mkcert installation](https://github.com/FiloSottile/mkcert)

```sh
node -e "require('node:fs').mkdirSync('test-results',{recursive:true})"
mkcert -install
mkcert -key-file test-results/localhost-key.pem -cert-file test-results/localhost.pem 127.0.0.1 localhost
npm exec -- wrangler dev --config server/wrangler.jsonc --local --local-protocol https --ip 127.0.0.1 --port 8787 --https-key-path test-results/localhost-key.pem --https-cert-path test-results/localhost.pem
```

Set `"driftBreak.multiplayer.serverUrl": "wss://127.0.0.1:8787"` in VS Code User Settings and reload the window. Use a second VS Code window or the browser version for the other player. For browser development, put `VITE_DRIFT_MULTIPLAYER_URL=wss://127.0.0.1:8787` in `.env.local` and run `npm run dev`. Set the same variable before `npm run build` to configure a static browser release. Serve that release over HTTPS.

## Deploy to Cloudflare

1. Sign in with Wrangler and enable a `workers.dev` subdomain for your Cloudflare account.
2. Deploy the Worker and its Durable Object migration from the repository root.

   ```sh
   npm exec -- wrangler login
   npm exec -- wrangler deploy --config server/wrangler.jsonc
   ```

3. Use the deployed origin in the form `wss://drift-break-rooms.<your-subdomain>.workers.dev`. To ship your own Worker as the default, update the default value of `driftBreak.multiplayer.serverUrl` in `package.json` before packaging. To test a different Worker with an existing install, set that same User Setting for both players and reload VS Code. The extension adds the room path and permits connections to that path in its webview policy.

SQLite-backed Durable Objects and WebSocket hibernation are available on Workers Free. Active rooms consume the account's Workers and Durable Objects quotas. [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

## Room behavior

- A race pauses when either view loses driving focus or a player disconnects. Both players choose **Ready to drive** when they return. Reconnection restores the local race in the same webview during the 30-second reservation. Changing from the sidebar to the editor or back explicitly leaves the room.
- Waiting rooms expire after 10 minutes, races after two hours, and results after one minute. Leaving as host or leaving an active race closes the room. A guest's expired slot in an open lobby can be filled by another player.
- Room codes are private invitations. The relay trusts the clients' finish reports and uses the first report it receives. Latency can decide a close finish. There are no opponent collisions, public matchmaking, leaderboards, or server-side replay.
- The relay accepts fixed 20-byte pose packets and limits forwarded updates and room commands per connection. Standard clients send poses at 10 Hz. Cloudflare plan limits also apply to incoming requests and messages. An unavailable service or exhausted quota may prevent joining or interrupt a race. Solo remains available from the mode picker.

## Verify the service

```sh
npm run worker:check
npm exec -- wrangler deploy --config server/wrangler.jsonc --dry-run --outdir test-results/worker
npm test
npm run build
```

For the installed-extension check, install `playwright`, `psutil` and `websockets` with pip. Set `DRIFT_MULTIPLAYER_TEST_URL` to `default` to test a fresh install with the packaged server default, or set it to a running Worker origin to test a custom server. Package the extension and run `npm run test:workbench -- <path-to-vsix>`. The suite compares Solo and Multiplayer frame rate and JavaScript heap use in both VS Code views. The report is saved under `test-results/workbench-*/workbench-results.json`.

Use a local Worker or an authorized staging deployment for the full workbench suite. For the public Worker, use one normal two-player room to verify connectivity and a race. See the [release checklist](https://github.com/aswin-panengal/drift-break/blob/main/docs/RELEASE.md#hosted-multiplayer) for the hosted coverage and the tests that remain open.
