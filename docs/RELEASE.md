# Drift 68 1.1.1 release checklist

The candidate is **Drift 68 1.1.1**, extension **`aswin-dev.drift-68`**, developer **Aswin Panengal**, planned tag **`v1.1.1`**. This patch refreshes the title and Rearwind 84 model. The existing private repository is `aswin-panengal/drift-68`. GitHub Actions builds the VSIX and offline browser ZIP. The [verification record](RELEASE_VERIFICATION.md#drift-68-111) covers the local patch.

## Before making the repository public

- [ ] Clear the Drift 68 name in the intended markets. The rebrand addresses the old exact-name finding. Rights in the new name remain unverified.
- [ ] Confirm the MIT grant and copyright holder for original materials. The current holder line remains in place until the rights chain is confirmed. With confirmation, use `Copyright (c) 2026 Aswin Panengal` for Aswin's material, preserve other rights holders' notices, and rebuild. Review the cover capture and asset evidence in the [release verification record](RELEASE_VERIFICATION.md).
- [x] Sanitize both local branch histories. Local `main` and `release/drift-68` now point to the content-identical root `cb9eeeb`, whose author and committer use the verified GitHub noreply address. Git also uses that address for future commits. The original was backed up privately outside this project. [Verification record](RELEASE_VERIFICATION.md#git-history-privacy-preflight)
- [x] Decide on the historical email. The owner accepts that the original commit's email will be visible. Keep the existing remote root and publish the reviewed Drift 68 files as a normal descendant of `origin/main`. The alternative sanitized local root is retained for local use.
- [x] Prepare the candidate on `publish/drift-68`, based on the fetched `origin/main` at `1f28706`. The remote and sanitized roots had identical trees, so the pending rebrand carried over byte-for-byte.
- [ ] Review the candidate commit and approve the normal push and visibility change separately. Exclude the local historical audit, credential files, test profiles and build caches. Check Cloudflare logging and optional online privacy disclosures before publication.

### History and privacy verification

The authenticated review found only `main` at `1f28706`, with no other advertised heads, tags or pull-request refs. There were no open or closed pull requests, non-owner collaborators, forks, invitations, releases, issues, stored Actions secrets or deployment records. The default branch reported no classic protection, active branch rules or repository rulesets. The GitHub Wiki setting was enabled and its Git endpoint reported no repository. GitHub Actions is enabled with read-only default workflow permissions. No registered workflows, runs, artifacts or environments were present at the time of review. Gitleaks 8.30.1 returned zero findings in Git history, the candidate working tree and both unpacked 1.1.0 archives. A separate redacted scan also returned no matching credential patterns. Review the intended commit and current remote state again before opening access.

The owner accepts the old email. Under the chosen history-preserving path, the original root remains visible in ordinary GitHub history and new commits should use the verified noreply address. Before changing visibility, check the exact advertised refs, inspect the expected commit tree and public-facing repository settings, and rescan all candidate Git trees and archives. After an approved publication, verify from a signed-out session that the intended branch and files are accessible and enable GitHub secret scanning and push protection where available. [GitHub visibility guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility) ? [GitHub secret scanning](https://docs.github.com/en/code-security/secret-scanning/enabling-secret-scanning-features/enabling-secret-scanning-for-your-repository)

### Repository identity and first push

The GitHub repository was renamed to `aswin-panengal/drift-68`. Use that name in the package manifest, release commands and Marketplace Trusted Publishing policy. Use the About description "A lightweight 3D drifting game for coding breaks in VS Code, featuring offline Solo and online 1v1." Use the topics `vscode-extension`, `racing-game`, `threejs`, `drifting` and `multiplayer`.

After explicit push approval, fetch `origin/main` again. Check that the reviewed candidate descends from its current tip and that the commit changes match the approved file list. Use the normal push below only from the reviewed candidate. If the remote has advanced, stop and review its new commits before proceeding.

```sh
git fetch origin
git merge-base --is-ancestor origin/main publish/drift-68
git push origin publish/drift-68:main
```

Review the private CI result and confirm the exact candidate SHA on GitHub before separately approving public visibility.

## Build and publish the GitHub release

- [ ] Set required CI checks on `main` and protect release tags matching `v*` against updates and deletion. Approve the commit and push first. CI checks pushes and pull requests with the locked dependencies, ESLint, Vitest, TypeScript, Vite, VSCE packaging, and a local Wrangler dry run. CI has read-only repository access.
- [ ] Once the review and CI are green, approve tagging and pushing `v1.1.1` from the reviewed commit. On the tag, CI checks the version and rebuilds both archives twice, comparing the checksums. Download the `drift-68-release` artifact from the successful tag run and verify that `SOURCE_COMMIT.txt` equals `git rev-parse 'v1.1.1^{commit}'`. Run `sha256sum --check SHA256SUMS.txt` from the downloaded directory, or compare the two hashes using PowerShell `Get-FileHash -Algorithm SHA256`.
- [ ] Install that exact VSIX in a disposable profile and run `npm run test:workbench -- <path-to-vsix>`. Check the offline browser archive over localhost and run a normal 1v1 smoke test with the exact package. Verify README screenshots and links using the public tag. Use the [hosted multiplayer checklist](#hosted-multiplayer) when recording results.
- [ ] After explicit approval, create a draft for the existing tag. Attach the VSIX and the two verification files from the approved CI artifact. Keep the offline browser ZIP for a later release decision. Review the assets and release notes, then approve publishing the GitHub draft. Run the example from the artifact directory with the GitHub CLI authenticated.

  ```sh
  gh release create v1.1.1 --repo aswin-panengal/drift-68 --verify-tag --draft \
    --title 'Drift 68 1.1.1' --notes 'Refreshed title screen and Rearwind 84 model. Includes offline Solo and online 1v1.' \
    drift-68-1.1.1.vsix SHA256SUMS.txt SOURCE_COMMIT.txt
  ```

### Reproduce the archives

Use a clean checkout with Node `24.14.1`, its bundled npm `11.11.0`, and Python `3.12`. Leave `VITE_DRIFT_MULTIPLAYER_URL` unset for the distributed offline browser build. The VSIX includes the existing hosted Worker default. GitHub Actions on Ubuntu 24.04 provides the canonical release archives. The packaging script fixes archive entry order, timestamps, and permissions and checks the exact contents. README links in the VSIX resolve against the version tag.

```sh
npm ci
npm run lint
npm test
npm run worker:check
python scripts/package-release.py release/1.1.1 --tag v1.1.1
python scripts/package-release.py test-results/rebuild --tag v1.1.1
```

Compare the `SHA256SUMS.txt` files. Windows and Linux checkouts can differ in line endings and toolchain output. Use the tagged Ubuntu CI artifact for publishing.

## Configure Marketplace Trusted Publishing

- [ ] Confirm management access to publisher `aswin-dev`. The publisher page is visible publicly. Publisher management is required to create the policy. [Marketplace publisher](https://marketplace.visualstudio.com/publishers/aswin-dev) · [Publisher management](https://marketplace.visualstudio.com/manage/publishers/aswin-dev)
- [ ] In GitHub **Settings → Environments**, create `marketplace`. Configure required reviewers, limit deployments to the `main` branch, and disable administrator bypass. If a second reviewer is available, enable prevention of self-review. With one maintainer, leave self-review available so the maintainer can explicitly approve the job. After reviewer protection is configured, set `MARKETPLACE_PUBLISH_ENABLED=true` as an **environment** variable. Remove the variable or disable the policy if the environment is retired. [GitHub environment protection](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- [ ] In Marketplace publisher management, open **Trusted Publishing → Create** and enter the policy below. Create it after the GitHub repository is public. The locked `@vscode/vsce` version, `4.1.1`, exchanges the GitHub OIDC token for a short-lived publishing credential. [Marketplace Trusted Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing)

  | Field | Value |
  | --- | --- |
  | Policy name | Drift 68 GitHub release |
  | Repository owner | `aswin-panengal` |
  | Repository | `drift-68` |
  | Workflow | `marketplace.yml` |
  | Environment | `marketplace` |

- [ ] After a stable GitHub release is public and Marketplace publication is explicitly approved, dispatch from `main` with `gh workflow run marketplace.yml --repo aswin-panengal/drift-68 --ref main -f release_tag=v1.1.1`. The verification job rebuilds the tagged source and compares its VSIX bytes, checksum manifest and source commit against the public GitHub release. Review that job before approving the `marketplace` environment in Actions. The publishing job verifies the downloaded VSIX again and sends that file with `vsce publish --oidc --packagePath`. The workflow runs only on manual dispatch.
- [ ] Verify the Marketplace listing, publisher, published version, README links, and installation once the approved run succeeds. If withdrawal is necessary, use **Unpublish** in publisher management. [Marketplace unpublishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#unpublishing-extensions)

### Verify the public listing

After an explicitly approved publish, confirm the product name, ID, version, links and icon from a signed-out session and install it in a clean profile. Publish the standalone browser files later only after separate approval, verification of the exact archive and a decision about its multiplayer endpoint and privacy disclosure.

## Hosted multiplayer

- [x] The rebranded candidate passed both VS Code views against an isolated local Worker, including reconnect and room cleanup. See the [verification record](RELEASE_VERIFICATION.md).
- [x] The prior `1.1.0` package completed a normal editor 1v1 session on the default hosted Worker, including movement relay, pause, reconnect, and results. The local Worker covered Explorer 1v1, room validation and expiry, and reconnect. A simulated HTTP 503 showed the busy message and kept Solo playable.
- [x] The local Drift 68 VSIX passed a single hosted-default editor smoke through room creation, join, readiness, movement relay and leave.
- [ ] Repeat the normal hosted smoke against the GitHub tag's final VSIX. Hosted Explorer/mobile combinations, cross-region latency, simultaneous-room capacity, long-running behavior, and real production quota exhaustion remain unverified. Use local or authorized staging for failure and capacity checks. Keep traffic to the public Worker limited to ordinary smoke play.
- [ ] Review usage before promoting a release. The free plan's shared quotas can interrupt 1v1 and the casual relay accepts client finish reports. The browser release ships with Solo available offline, and the VSIX's 1v1 falls back to the busy message if the service is unavailable. The existing Worker name, URL, Durable Object migration and bindings are outside these workflows. [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
