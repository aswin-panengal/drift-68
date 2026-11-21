# Drift 68 1.1.0 release verification

- **Developer** Aswin Panengal
- **Extension** `aswin-dev.drift-68`
- **Publication branch** `publish/drift-68`
- **Prepared** 21 November 2026

This candidate is for maintainer review. The public release gates are in the [release checklist](RELEASE.md). Keep version 1.1.0 because the feature set and multiplayer protocol are already versioned and the rebrand does not require a gameplay release increment.

## Compatibility

The extension ID changes to `aswin-dev.drift-68`. It is a separate installation from any old-ID test VSIX. VS Code scopes its global extension storage by extension ID, so old-ID local records and snapshots do not automatically appear under the new ID. The browser retains its existing storage key on the same site origin. The existing VS Code command IDs, Explorer view ID, settings key and internal save keys are preserved. The deployed Worker name, WebSocket origin, room protocol, Durable Object binding and migration are unchanged.

## License and provenance

| Material | Evidence | Release treatment |
| --- | --- | --- |
| Vite 7.3.8 module-preload helper | Production JS contains the generated helper. The complete Vite core MIT notice from the installed package is generated into the combined notices. | Present in the VSIX, browser ZIP and runtime Licenses screen. The package verifier checks that the Vite attribution is present. |
| Three.js 0.183.2 and BufferGeometryUtils | Locked dependency and runtime imports. | Preserve its complete MIT terms in both packages and in the embedded notices. |
| Outfit | Source WOFF2 has 100 mapped default glyphs whose outlines and advance widths matched the upstream Outfit TTF in the prior audit. The OFL text matched upstream. Exact original subset-export command remains unknown. | Font redistribution follows SIL OFL 1.1, and both archives include the font license. Project MIT terms apply to original project material. [Outfit upstream files](https://github.com/google/fonts/tree/main/ofl/outfit) |
| Title cover and eight screenshots | The previous cover was replaced with a new game-render capture. The capture script uses the Coastal Drive scene, Rearwind 84, a fixed camera and local Chromium. Browser tests produced all eight documentation screenshots after the replacement. | The exact capture procedure is recorded below. Rights in depicted game content depend on the project rights chain. |
| Models, scenery, maps, textures and sound | Geometry, material colors and track points are constructed in the renderer and configuration source. Web Audio synthesizes engine and effects. All three sampled game scenes reported zero renderer textures. No imported models, textures, music or audio samples were identified. | This evidence records how the files are produced. Contributor rights and reference inputs still need owner confirmation. |
| Icon, wordmark and interface icons | `scripts/create-media.py` reproduced both extension icon files byte-for-byte in the prior audit. The on-screen title uses the same UI font and styles with new lettering. Local path literals supply control icons. | Retain design authorship evidence and complete clearance of the new word and device marks. |

The existing copyright holder line was retained because repository authorship metadata and the stated developer identity do not independently establish the rights chain. Use `Copyright (c) 2026 Aswin Panengal` on Aswin's original material once ownership is confirmed. The combined notices identify the separately licensed runtime components and the [dependency inventory](DEPENDENCY_LICENSES.md) covers the installed toolchain. The original-brand audit is intentionally excluded from release staging and packages.

To regenerate the cover, run a clean local Vite dev server and use Playwright Chromium and Pillow. Headless GPU backends and encoder versions can affect capture bytes. The production build copies the reviewed image already in the source tree. This candidate cover SHA-256 is `b64a1393f28a7798538bcd5ef620268b9a51494649ff7dc8e75c9587fd7a076e`.

```sh
npm run dev
python scripts/capture-cover.py http://127.0.0.1:5173
npm run test:browser
```

## Tests and artifact checks

| Check | Result |
| --- | --- |
| Dependency install | Clean npm install from lockfile with Node 24.14.1 and npm 11.11.0. |
| Lint and Vitest | ESLint passed. 61 tests passed across five files, including lap simulation, drift/boost, coordination, persistence and multiplayer protocol/state. |
| TypeScript and Worker | Extension/game and Worker type checks passed. Wrangler dry run produced an 11.11 KiB Worker and the expected `ROOMS` binding. |
| Browser development | Passed all 12 car/circuit pairings, keyboard input, drift, cameras, lap and Zen flows, settings and records, compact layouts, WebGL recovery and cleanup. No external requests or page errors recorded. Repeated scene builds stabilized at 41, 34 and 32 geometries per circuit with a sampled heap of about 16 MiB. Headless rates are machine-specific. |
| Production browser ZIP | Extracted, served on loopback and checked with external traffic blocked. Title, Vite license and keyboard Solo drive passed. No external requests observed. |
| VSIX and repeat packaging | Two independent local builds produced identical VSIX and ZIP bytes. Both contained the checked licenses, expected file lists and the same production webview bytes. The VSIX is about 1.34 MiB. Its installable identity and runtime checks are recorded below. |
| CI workflow validation | actionlint 1.7.12 passed. Push/PR does lint, tests, type checks, Worker dry run, build and packaging. The tag path double-builds and checks version and hashes. A separately dispatched workflow verifies the released VSIX before environment-protected OIDC publishing. GitHub-hosted execution, reviewer settings and OIDC issuance still require release-owner verification. |
| Security and privacy | npm audit reported zero advisories in both production-only and full checks. Redacted text scanning of the candidate and historical tree found no matching credential patterns. Git ignore checks covered environment files, keys, Worker state, profile output and release files. The private remote's sole branch still contains the original personal-email metadata. Local Git noreply is configured. |
| Extension Development Host | Passed in VS Code 1.110.0. Verified activation by the new ID, command and Explorer registration, one editor panel, maximize/restore, transfers in both directions, close and reopen, and record persistence/reset. |
| Installed VSIX and both Solo views | Passed. Installed into a fresh VS Code 1.110.0 profile as `aswin-dev.drift-68@1.1.0`. Explorer and expanded editor, narrow view setup, keyboard focus, one renderer, standard gamepad input replay, lap scoring, reload persistence and record-reset confirmation passed. Physical gamepads remain a manual check. |
| Installed VSIX and local 1v1 | Passed in Explorer and editor against an isolated local Worker over TLS. Verified room creation and joining, third-player rejection, CSP path restrictions, movement relay and opponent render, pause, reconnect, race results, room leave and alarm cleanup. The Windows loopback test peer retries transient transport-only handshake failures. |
| Hosted multiplayer | One ordinary editor room passed on the exact local VSIX and its packaged production default using normal TLS and no user override. Created and joined the room, started and readied both sides, observed movement relay and left. Full production reconnect, both-view coverage, load and retention settings remain unverified. Repeat the smoke against the tagged VSIX. |
| Marketplace authentication | Publisher management, reviewer approval and OIDC issuance remain unverified. The dispatch and publish steps were left unused. |

The short installed workbench sample measured 30.05 FPS Solo and 29.91 FPS 1v1 in Explorer, and 60.10 FPS Solo and 60.22 FPS 1v1 in the editor. Sampled JavaScript heap rose from 7.27 to 7.90 MiB in Explorer and from 7.28 to 7.96 MiB in the editor. This measures the test workload on one Windows machine. Full process memory and long-running sessions remain unverified.

The earlier working-tree verification artifacts are under `release/`. Use the canonical tagged Ubuntu workflow output for publication once authorized.

| Earlier verification artifact | Local SHA-256 |
| --- | --- |
| `drift-68-1.1.0.vsix` | `2c6fde142a953a294dc91d006c012a08f392e44328452d09be1290ab743d0436` |
| `drift-68-web-1.1.0.zip` | `a56398c48628c7f92bf9945ec2c0a2255acf6c2c97d137f97520a7012336065f` |

## Review inventory

The rebrand changes package identity and script metadata (`package.json`, `package-lock.json`), user-facing game and VS Code labels (`index.html`, `.vscode/launch.json`, `src/game/core/Game.ts`, and the extension host?s `GamePanelManager.ts`, `GameViewProvider.ts`, `WebviewHtml.ts` and `extension.ts`). Test updates are in `scripts/browser_test.py`, `scripts/extension_ui_test.py`, `scripts/multiplayer_workbench.py` and `tests/extension/index.ts`. It refreshes `public/drift-cover.webp` and the title, circuits, garage, driving, rear-chase, results and two sidebar screenshots under `docs/screenshots/`. The existing road icon was retained.

CI and shipping changes are in `.github/workflows/ci.yml`, `.github/workflows/marketplace.yml`, `eslint.config.mjs`, `scripts/package-release.py` and `.gitignore`. License and asset evidence are in `scripts/licenses.mjs`, `THIRD_PARTY_NOTICES.md`, `docs/DEPENDENCY_LICENSES.md` and `scripts/capture-cover.py`. Public copy and release operation details are in `README.md`, `PRODUCT.md`, `DESIGN.md`, `docs/ACCEPTANCE.md`, `docs/MULTIPLAYER.md` and `docs/RELEASE.md`. The branch also contains the already-present in-progress 1.1.0 work from before the rebrand.

Before publication, resolve the name clearance and copyright ownership questions, make the historical email decision and verify protected Marketplace settings. The [release checklist](RELEASE.md) includes the optional GitHub repository rename and its migration steps.

## Git history privacy preflight

The account-specific GitHub noreply address in repository-local configuration matches the authenticated owner's numeric account ID and login. Git's effective author and committer settings use that address for future commits. The original address is omitted here.

The only reachable project commit was the unsigned root `1f28706`. Its author and committer both use the same personal address. At preflight, local `main`, local `release/drift-68` and private `origin/main` all pointed to it. Local Codex checkpoint refs point directly to file trees and carry no commit metadata. The advertised remote refs showed only `main` and its HEAD alias. GitHub reported the owner as the only collaborator, no pending invitations, no forks and no releases. There were no local or remote tags. Offline clones are outside these checks.

The redacted scan covered 89 candidate files, the five distinct reachable Git file trees, and the 22 VSIX and eight browser ZIP entries. It found no exact match for the personal email in file contents and no matches for the tested credential patterns. Both archive checksums and ZIP CRCs passed. A fresh build matched the existing VSIX and browser ZIP byte-for-byte. ESLint, TypeScript and all 61 tests passed.

**Local rewrite complete.** With approval, the two local branches moved from `1f28706` to the sanitized root `cb9eeeb` in one Git transaction. Both email fields now use the verified account-specific GitHub noreply address. A raw commit comparison confirmed that the file tree, commit message, names and timestamps are identical. A verified private Git bundle is stored outside the repository. The index and all 89 candidate files matched byte-for-byte immediately after the ref update.

After the rewrite, Git connectivity, ESLint, TypeScript and all 61 tests passed. The redacted scan again found no copies of the old address or matching credential patterns in the candidate file contents, reachable file trees or the release archives. Two post-rewrite builds reproduced the original VSIX and browser ZIP byte-for-byte. The only working-tree edits made as part of remediation are the release checklist and this verification record.

The old commit remains in the local reflogs, private backup and remote-tracking history. The private remote still advertises the old commit at `main`. A normal push cannot replace it with the sanitized root because the roots differ. The owner subsequently approved public visibility of the old email and directed that the remote history be preserved. The release plan is to keep the existing root and commit reviewed Drift 68 files on top with verified noreply metadata. Review the publication gates in the [release checklist](RELEASE.md).

## Private GitHub publication preflight

The fetched private remote has a single substantive project commit. A raw object comparison found precisely the two intended email field substitutions between it and the sanitized local root. The tree, commit message, names and dates are byte-identical. No other advertised branches, tags or pull-request refs, and no remote-only project changes were found. Affected GitHub settings and the optional rewrite verification procedure are recorded in the [release checklist](RELEASE.md#history-and-privacy-verification).

Gitleaks 8.30.1 found zero matches across reachable Git history, the tracked and nonignored candidate files, and the unpacked VSIX and browser ZIP. The redacted checks of reachable trees, the current source and archive contents also found no matching credential patterns. The archive checksums and integrity checks passed. The publication candidate uses the existing remote root as its base. Both sanitized local branches remain available for comparison. The original email will remain visible if that history is published, as approved by the owner.

## Publication candidate verification

The publication branch is a direct descendant of the existing remote root `1f28706`. The 89 candidate files carried over byte-for-byte when the branch was created. The final staged export excluded local credentials, caches, test profiles, release archives and the private audit.

- Clean lockfile install, ESLint, application and Worker type checks, all 61 tests, Workflow validation and the Worker dry run passed.
- Gitleaks reported zero findings in the history, staged candidate and unpacked artifacts. npm audit reported zero advisories for both the production and full dependency graphs.
- Two builds from the isolated staged export returned byte-identical VSIX and browser archives. The archive checks verified branding, manifests, file lists and all three third-party license notices. The VSIX installed in a fresh VS Code 1.110.0 profile as `aswin-dev.drift-68@1.1.0`.
- The final release checklist and verification record are source documents outside the package allowlist. The verified artifacts are stored locally under `release/publication-candidate/`.

| Publication candidate artifact | SHA-256 |
| --- | --- |
| `drift-68-1.1.0.vsix` | `44dfce36a644f60b94d6f87cf0434faa48ffe1ba36c13da08f22a8ff3f25028c` |
| `drift-68-web-1.1.0.zip` | `a56398c48628c7f92bf9945ec2c0a2255acf6c2c97d137f97520a7012336065f` |

GitHub still lists the private repository under the confirmed slug with `main` as its default branch. The About description, homepage and topics are empty. The [checklist](RELEASE.md#repository-identity-and-first-push) records the suggested About copy and normal fast-forward procedure. The existing copyright attribution remains the record of holder pending rights confirmation.
