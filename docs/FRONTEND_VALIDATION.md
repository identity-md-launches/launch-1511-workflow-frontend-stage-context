# SOREN frontend validation

Worker validation of the delivered source and static export on 2026-10-13. These results are observations from this worker, not an independent audit or the later publication checks.

| Area | Final result |
| --- | --- |
| Production build and TypeScript | Passed |
| Unit checks | 11 passed |
| Chromium interaction scenarios | 18 passed; wallet and write RPCs mocked |
| Keyboard-only paid-guess flow | Passed connect, prepare, backup acknowledgement, approve, commit, refresh and reveal |
| Reflow | No horizontal scroll at 320, 390, 768, 1440; long addresses/balances also exercised |
| Text enlargement | 200% root text at 390: scroll width 390, viewport 390 |
| Main action on the first 390×844 screen | Yes: top 744.625, bottom 788.625 |
| Pinned taste@1 probe | 14/16 raw checks passed; two reviewed flags explained below |
| Manifest and ABI binding | Passed against the actual pinned handoffs and source commit |
| Live read-only checks | Both RPC chain IDs and both application contracts verified; all configured Uniswap contracts returned code; IMD metadata and a live quote read |
| Dependency audit | Zero reported vulnerabilities |
| WebKit / native Safari | Unperformed; worker runtime could not open a page |
| Real funded writes | Intentionally unperformed; no live transaction broadcast |

## Scope and assumptions

Implemented the approved terminal-style seven-chapter hunt: vault counters, chapter records, transcript/typewriter and hints, paid commit/reveal, browser recovery, solver records and event-based ranking, progressive lore, owner setup/funding/publication/hints, wallet handling and pool swaps. The delivered frontend reads the actual Ethereum deployment. At the live-state check, `token()` was unset and all chapters were locked; that is shown explicitly, with owner-only setup controls when the owner connects.

Only `web/**`, `dist/**` and `docs/**` are submission paths. The sole ignore-file allowance used is `web/.gitignore`. The overriding path rule prevents a root `DESIGN.md`; its full content is delivered in [docs/DESIGN.md](DESIGN.md). Deployed sources, existing ABIs, root configuration, `lib/` and `.github/` are untouched. Publication, fixed CID, site naming and public URL are subsequent publisher work.

No owner/key/address was invented. Test wallets are explicitly isolated mock fixtures, with random addresses and no private keys. The runtime has no fixture entrypoint, fake leaderboard or seeded contract balances. No WalletConnect project ID or USD price source was supplied, so injected wallets and token-unit context are used.

## Checks and reproducibility

Run commands from the repository root unless stated otherwise. Dependency installation used the allowed frontend directory and `/tmp` caches.

| Command | Observed outcome |
| --- | --- |
| `npm --prefix web install --cache /tmp/soren-npm-cache` | Dependencies installed under `web/`; exact versions and lockfile delivered |
| `npm --prefix web run build` | TypeScript and Vite passed; ABI export and manifest verification passed |
| `npm --prefix web run typecheck` | Passed independently during implementation and as part of final build |
| `npm --prefix web test` | 11/11 passed: normalization, sender-bound hash, recovery validation, block/window boundaries, amount precision, slippage, standard/extended/native router encoding, ABI hashes, error translation |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/soren-browsers npm --prefix web run test:browser` | 18/18 Chromium scenarios passed; see [browser-results.json](frontend/browser-results.json) |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/soren-browsers npm --prefix web run test:keyboard` | Full keyboard flow and 200% root text enlargement passed; see [keyboard-results.json](frontend/keyboard-results.json) |
| `IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" PLAYWRIGHT_BROWSERS_PATH=/tmp/soren-browsers node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Rendered production export at 320, 390 and 1440 plus reduced motion; [full probe output](frontend/taste.json) retained |
| `npm --prefix web run verify` | Exact handoff identifiers/contracts/pool/network/wallet configuration; all ABI and asset hashes; inventory and path/size limits passed |
| `npm --prefix web run check:rpc` | Both supplied public RPCs returned chain 1 and nonempty code for both application addresses |
| `npm --prefix web run check:pool` | All six configured Uniswap contracts returned code; pair symbol IMD and decimals 18 matched; quoter `eth_call` succeeded |
| `npm --prefix web audit --cache /tmp/soren-npm-cache --json` | Zero findings in the final dependency tree |
| Development manifest/ABI HTTP comparison | The Vite development middleware returned the identical committed manifest and both raw ABI arrays |

The production bundle is about 566 KB uncompressed (175 KB gzip), which causes Vite's default 500 KB chunk warning. Total declared export assets are 653,594 bytes, across eight files; this is far below the assignment's response and file limits. The manifest excludes itself. A verification-only Git bundle containing the full frontend submission delta against the attested base was 762,798 bytes before the final budget report; a 64 KiB documentation reserve still leaves it far below 8 MiB. See [submission-budget.json](frontend/submission-budget.json). The warning is retained rather than hidden. No external fonts, image CDN, vendored registry, cache directory or dependency archive is exported.

The browser harness owns a temporary static server at `/preview/`, exercising relative paths without rewrites. It closes that server and its browsers afterward. Required tests are delivered under `web/tests/`, not only in disposable scratch space. The probe uses the original pinned script; it was not changed. The final browser console recorded zero errors and warnings. Its network log includes an earlier navigation in the same tool session; requests 40 onward show the final export assets.

## Browser and interaction coverage

The 18 Chromium scenarios cover:

1. Disconnected/missing wallet, metadata, mobile first action and responsive widths.
2. Rejected connection, wrong chain and exact `wallet_addEthereumChain` fallback.
3. Rejected approval, pending lock, exact 100 SORN burn, commit, reload recovery, same-block prohibition, incorrect-answer simulation, and winning reveal.
4. Denied storage, downloadable recovery and wrong-wallet restoration refusal.
5. Chain-time expiry and account-change isolation.
6. Owner-only visibility, permanent token setting, approval/funding, hashed publication and hint byte limits.
7. Buying with IMD through separate token and Permit2 approvals, exact router encoding and zero ETH value.
8. Selling SORN, quote invalidation and a failed router simulation that never requests a swap signature.
9. Missing contract code and recovery through refresh.
10. Real-shaped event discovery, lifetime stats, long values, open wallet disclosure, keyboard focus and reduced motion.
11. A mined revert with retry feedback and no false confirmation.
12. Restoring an archived committed guess after preparing an unsubmitted replacement.
13. Reloading with an unresolved approval, keeping writes locked until a receipt check confirms it.
14. An account change during simulation aborting before signing.
15. RPC outage with unknown counters and a working retry.
16. Tampered ABI refusal before exposing wallet actions.
17. Quote expiry and transcript/typewriter disclosure, including all seven chapter records.
18. Honoring the selected EIP-6963 wallet when using the main connect action.

The separate keyboard test reaches the entire commit/reveal flow using Tab, Enter and Space rather than pointer clicks. It observes a 2px focus outline and tests enlarged root text after successful reveal. Native browser-UI zoom is a different check and is not claimed.

The available browser tool also opened the final live-read export at 390×844 and 1440×1000. The mobile primary button was measured at x=29, y=744.625, width=332, height=44, and the page scroll width was 390. Screenshots were visually inspected, including the final mobile screen, desktop layout and the focused approval state.

Evidence:

- [Mobile first screen, actual read-only deployment](frontend/mobile-390.png)
- [Desktop, actual read-only deployment](frontend/desktop-1440.png)
- [Keyboard focus, mocked funded chapter](frontend/keyboard-focus.png)
- [Committed guess and recovery controls, mocked funded chapter](frontend/commit-recovery-mocked.png)
- [Rendered measurements](frontend/render-review.json)
- [Manifest verification](frontend/manifest-verification.json)
- [Live application code checks](frontend/rpc-check.json), [live vault state](frontend/live-state.json), [live pool quote](frontend/live-pool.json)

## Better Interface review: all six domains

The pinned workflow and core principles for all six domains were read before implementation; the final source and rendered export were reviewed against them. The one visual idea is an intercepted terminal that puts the costly guess controls before its story.

| Domain | Coverage and evidence | Limitations |
| --- | --- | --- |
| Accessibility | Native controls/details, associated labels, distinct help text, headings/landmarks, skip link, live status/error regions, full keyboard flow, visible focus, reduced motion, target sizes and enlarged text | No screen-reader session, physical touch-device testing or native UI zoom; no claim of full WCAG certification |
| Layout | First-screen action measured; 320/390/768/1440 reflow, long balances/full addresses, wallet disclosure, pending/error/owner states, adaptive columns and 200% text | No localization/RTL variant is implemented; native device/browser combinations not exhaustively tested |
| Writing | Explicit token units, irreversible burn/deposit/setting language, separate approvals, restoration and retry instructions, truthful unknown/stale/partial state | No price feed or fabricated dollar value; quote output is a point-in-time estimate |
| Typography | One system monospace stack, six-size maximum, weights 400/600/700, strongest headline, 16px inputs, tabular counters, wrapping full critical values | Installed system font differs by platform; monospace is the brief's deliberate override |
| Colors | Semantic tokens, redundant state labels, measured solid-background contrast; probe passed all resolved text pairs | Scanline overlay and antialiased edge pixels are not independently evaluated by the probe; forced-colors styles reviewed in source, not certified across OSes |
| UI | Own pending state per action, duplicate-write lock, persistent errors and receipts, progressive disclosure, no nested card surfaces/shadows, bounded typewriter/glitch, reduced motion | WebKit unavailable; animation-panel 10%-speed replay and native wallet application UI not performed |

## Findings, fixes and rechecks

These are implementation findings, with locations in the final source. No unresolved high or medium source/UI defect was observed in the checked states.

| Severity / domain | Source location | Observed problem and correction | Recheck |
| --- | --- | --- | --- |
| Medium / accessibility | `web/src/ui.tsx:163` (`label htmlFor`) | Help text was inside the label, becoming part of the accessible field name. Label and help now have distinct associations. | Exact label-based interactions pass for guess, owner and swap fields. |
| High / UI and recovery | `web/src/Guess.tsx:88` (`archive:`) | Preparing a replacement could overwrite the earlier secret before its replacement mined. Earlier recovery records are archived and can be restored against the current onchain hash. | Archive/restore scenario passes with no extra burn/write. |
| High / UI | `web/src/session.tsx:457` (`pendingKey`) and `:511` (`checkPending`) | A delayed receipt or page reload could otherwise allow resubmission before the first transaction's outcome was known. Persisted pending records keep writes locked; receipt checks restore the confirmed state. | Pending/reload/rejection/revert scenarios pass without duplicate sends. |
| Medium / writing and UI | `web/src/ui.tsx:112` (`WalletGate`) and `web/src/session.tsx` (`selectedId`) | Swap connection said “Connect to play”, and the main action could ignore a selected discovered wallet. Action labels now reflect the section; wallet selection is shared by all connectors. | Swap and selected-wallet scenarios pass. |
| Medium / feedback | `web/src/Guess.tsx` (`Status`) and `web/src/App.tsx` (`chapterIndex`) | Successful reveal changed branches and could hide its confirmation or jump to the next locked chapter. Transaction status persists and the latest solved transmission remains selected until another opens. | Winning reveal displays its confirmation and DECRYPTED state. |
| High / layout and typography | `web/src/styles.css:1049` (wrapping header) and `:1058` (adaptive metrics) | The 200% text test exposed overflow: viewport 390, scroll width 408. Header/status rows now wrap, and metric columns adapt to text size with wrapping labels. | Repeated full keyboard test at 200% reports viewport 390, scroll width 390. |
| Medium / error recovery | `web/src/Guess.tsx:426` (`restoreError`) and `web/src/domain.ts` (`reason`) | A restoration failure could be hidden in a closed disclosure; generic swap error wording could suppress the simulation reason. Recovery failures are visible outside the disclosure, and known/custom revert reasons are translated with safe fallback text. | Restore rejection, failed simulation and error-translation tests pass. |

## Interpreting the probe flags

The **raw score is 14/16**, not an invented clean pass.

- `type-faces`: flags six monospace prose blocks. The approved visual direction explicitly says “green and red monospace text”. One family and three weights are used; preserving the required terminal typography is intentional.
- `eyebrows`: flags the header's Connect wallet control, the live verification status, and three metric definition labels. These are functional controls/status/data labels, with normal casing and no tracking. Screenshots confirm they are not decorative uppercase labels above marketing headings. Removing them would remove useful state or the standard wallet control.

All other raw checks passed: render, layout, targets, contrast, casing, tracking, type sizes, glyphs, slogans, repetition, copy budget, surfaces, motion and share metadata. The first phone screen has 21 measured prose words against the 60-word bar. The raw probe reports 12 controls below its comfortable 44px size; all meet its 24px-or-spacing test. Native disclosures and separated copy/link controls account for the smaller targets.

## Live behavior and remaining limitations

The read-only live evidence confirms Ethereum chain ID 1 on both supplied RPCs, 1,722 bytes of LaunchToken code, and 8,051 bytes of SorenVault code. A separate check read the immutable owner, unset vault token, zero published/solved chapters and burns, 100 SORN commit cost and 86,400-second window. This does not initialize the vault or imply it is funded.

The configured Uniswap endpoints all returned code, the pair returned symbol IMD/18 decimals, and an `eth_call` quote for 1 IMD returned `392488519472942605450173` SORN base units at the recorded time. That is a historical validation response, not a current price or guarantee. No real router execution was signed.

WebKit's normal launch reported missing native libraries, including GStreamer/GTK/ICU. Libraries were downloaded and extracted only under `/tmp`, without changing system packages or the submission. An alternate bounded launch reached WebKit 26.0 but could not open a page within 25 seconds. Consequently no Safari interaction/rendering pass is claimed. Chromium tests and the supplied browser tool ran successfully.

No real wallet extension approval UI, funded commit/reveal, owner write, mined swap, mainnet race for a prize, reorganization or long historical leaderboard scan was exercised. Replacement receipts are handled in-session, but no actual wallet replacement was broadcast. Recovery storage is local and unencrypted; loss of both browser storage and the private backup cannot be repaired by the website. RPC range limits and archival availability can prevent exhaustive player enumeration, so leaderboard scope is explicit.

Open Graph assets use relative paths because the eventual gateway/domain is not supplied. Public availability/unfurling, IPFS pinning, named-site resolution and the control plane's immutable/named-copy checks have not run in this worker. The completed frontend source/export/evidence are the inputs to those subsequent steps.

Complete for the authorized frontend delivery scope, with the browser/live-chain and root-document-location limitations above recorded explicitly.
