# SOREN frontend

A static React/TypeScript terminal for the seven-chapter SorenVault hunt, with SORN/IMD swaps through the attested Uniswap v4 pool. The export is delivered in `../dist/`; hosting and IPFS publication happen after this assignment.

## Install, build and preview

Tested with Node 24.21.0 and npm 11.19.0. Use Node 22.12+ or 24.

```sh
cd web
npm ci
npm run build
npm run verify
npm run preview
```

`build` runs TypeScript, Vite, copies the implementation-derived ABIs, then generates and verifies `dist/imd-deployment.json` from the final exported bytes. Vite uses `base: './'`. Serve the entire `dist/` directory with ordinary static hosting; it needs no backend or route rewrites. Browser RPC reads and visitor wallet requests are runtime network operations. Opening `index.html` with `file://` is not supported; use an HTTP preview.

For local development, run `npm run dev`. The development middleware serves **the same `dist/imd-deployment.json` and ABI files**. A delivered export exists already; rebuild it first if it was removed. The production site never imports the build input directly.

The raster share card is checked in. To regenerate it from `web/assets/share.svg`, install Chromium for Playwright and run `npm run build:share`, then `npm run build`. The SVG source stays in `web/`; only its PNG export is shipped to visitors.

## Deployment configuration

`web/deployment.source.json` is the build input copied from the deployment/network handoffs. It contains the attested identifiers, full contract set, unchanged pool key, network object and wallet-add-chain parameters. It contains public endpoints, with no API keys. `dist/imd-deployment.json` is the **only runtime deployment configuration**. `src/config.ts` fetches that file and its referenced ABI arrays, verifies each canonical Keccak hash, and creates the chain and RPC clients. No application address/chain map is compiled into the JavaScript.

The ABIs are obtained from `docs/abi/<Contract>.json` at the manifest's pinned `sourceCommit`. `scripts/export.mjs` uses `git show` to compare the pinned ABI bytes with the repository export and verifies the canonical Keccak hash against the handoff. Rebuilding therefore needs the Git repository with that source commit available. Source contracts, the existing ABI exports, and root build configuration are preserved.

`scripts/verify.mjs` verifies the exact final inventory, every SHA-256, every canonical ABI hash, limits, safe relative paths, and equality with the source configuration. When `.imd/reads/` is present, it additionally compares identifiers, the complete contract set, pool key, network and wallet-add-chain object directly with the actual handoffs. These pinned inputs are not needed after submission.

Protocol interfaces in `src/protocol.ts` contain function/error signatures only. Every quoter, router, Permit2 and pool address comes from the runtime manifest's network block. The swap's full pool key comes directly from that manifest, including the nonzero initialization hook. The runtime honors `extendedSwapParams` if supplied. Both token ordering directions and the optional native-input branch have encoding tests; this deployment is an ERC-20 pair and sends no ETH value for swaps.

## Wallets and transactions

- EIP-6963 browser-wallet discovery plus an EIP-1193 injected-wallet fallback. No WalletConnect project ID was supplied; WalletConnect is not required or configured. Use an installed Ethereum browser wallet or its mobile in-app browser.
- Wallet connection is explicit. Account, chain and disconnect events invalidate reads. An unknown chain triggers the supplied `wallet_addEthereumChain` parameters after a failed switch, followed by another switch.
- Reads use the supplied public RPCs in order, with the connected wallet as a final fallback only on the correct chain. Chain ID and nonempty deployed code are checked. The token's symbol/decimals and vault token binding are read before enabling actions.
- The vault refreshes every 12 seconds while the page is visible and on manual refresh, wallet change and transaction confirmation. Snapshots include a block number and chain timestamp. Failed verification disables signing and identifies stale data.
- Every write is simulated, then the account/chain are rechecked before asking the wallet to sign. Each action has its own status, receipt and explorer link. Other writes are locked through confirmation; balances and allowances are refreshed at or after the receipt block.
- A pending transaction record is saved when storage permits. After a timeout or reload, another write is blocked until its receipt is checked. In-session replacements are compared with the requested sender, destination, calldata and value. If an original transaction is replaced while the site is closed and its original hash never receives a receipt, the pending lock may require manual wallet/explorer investigation; do not clear local data or resubmit a paid guess without confirming what mined.

No worker validation broadcasts a real approval, swap, commit, reveal or owner transaction.

## Playing and recovery

Answers use `toLowerCase().trim().replace(/\s+/gu, '')` for both owner publishing and guessing. No Unicode NFC/NFKC normalization is added. Commitments use Solidity `abi.encode(string,address,bytes32)`, not packed encoding. Each guess gets 32 bytes from `crypto.getRandomValues`.

Preparing a guess saves a record bound to chain, vault, wallet and chapter. It includes the normalized answer and secret. Copy/download a private backup and acknowledge the irreversible 100 SORN burn before approval/commit. Storage and clipboard failures are visible; manual JSON recovery remains available. Preparing a replacement archives the earlier record so a rejected replacement does not destroy an existing guess. These are **game recovery records**, never wallet seed phrases.

Reveal requires the current onchain commitment hash to match the local record, an open chapter, a later observed block, and chain time at or before the 24-hour deadline. The displayed ticking countdown is an estimate between chain snapshots; it never independently authorizes reveal. A wrong answer's simulation explains the failure. Only a successful mined reveal wins; lost/expired/replaced/wrong guesses are not refunded.

The owner panel appears only for the address returned by `owner()`. It can permanently set the attested SORN token, approve/fund prizes, publish the next sequential prefunded chapter using a locally hashed answer, and post/clear the current chapter's hint. UTF-8 byte limits and available funding are validated. No withdrawal action exists.

## Swaps, leaderboard and lore

The swap panel supports buying SORN with the configured IMD token and selling SORN back to IMD. It reads the token metadata, balances and both allowances. Quotes use `simulateContract` on the configured quoter. Quotes expire after 60 seconds; slippage is 0.01%–5%. Each insufficient allowance has its own step: token approval to Permit2, then Permit2 authorization to the configured router, with exact amounts and a one-hour authorization expiry. The router execute call is simulated before signing. Minimum output, rate, pool fee, token units and gas context are visible. There is no configured dollar-price source, so the interface says USD context is unavailable.

All seven chapter records and solvers come from the vault. The leaderboard discovers participants from `Committed` events, then reads their lifetime `playerStats` at a fixed block. The default range is the latest 5,000 blocks; a start-block input can request all history. Results explicitly identify the scanned range and potential missing wallets. Requests use 2,000-block chunks and eight concurrent stat reads; scans can be stopped and a range with over 500 participants asks for narrowing. RPC history limits can interrupt scans. There is no fabricated player list or local-only global leaderboard.

The lore starts with the approved story and adds the actual solved transmissions as recovered records. It does not invent chapter solutions or unpublished narrative.

## Validation

```sh
cd web
npm run typecheck
npm test
npx playwright install chromium webkit
npm run test:browser
npm run test:keyboard
npm run verify
npm run check:rpc
npm run check:pool
```

Browser tests start and close their own static server under `/preview/`. Wallet/RPC fixtures are test-only and use no private keys. They never send requests to a live chain. `check:rpc` and `check:pool` are read-only live checks; the latter uses `eth_call` for one IMD quote.

On a restricted worker, use a writable npm cache and browser directory, for example `npm ci --cache /tmp/soren-npm-cache` and `PLAYWRIGHT_BROWSERS_PATH=/tmp/soren-browsers`. Browser native libraries may need installing by the machine operator. The browser runner records unavailable WebKit separately from Chromium outcomes.

The pinned design probe, while its assignment input exists, is run from the repository root:

```sh
IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" \
  node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

See [validation](../docs/FRONTEND_VALIDATION.md), [implemented design](../docs/DESIGN.md), and [evidence](../docs/frontend/). These are worker-produced observations, not an independent audit or publication check. Native Safari, physical-device behavior, screen-reader sessions and real funded writes have limits recorded there.

## Submission scope and size

Only `web/**`, root `dist/**` and `docs/**` are delivered. **The sole ignore-file path budget is `web/.gitignore`.** Its directory patterns exclude `node_modules`, npm/pnpm/Yarn caches, Vite/cache directories and test outputs at every depth below `web/`. Dependency archives, browser binaries and caches stay outside the submission. Do not add a root ignore file, root package configuration, submodule or vendored registry.

The assignment also asks for a root `DESIGN.md`, which conflicts with its overriding allowed paths. The implemented document is delivered as `docs/DESIGN.md`; root files remain unchanged. Publication, IPFS pinning, site naming and a public URL are subsequent publisher work.
