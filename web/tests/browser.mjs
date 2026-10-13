import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  decodeAbiParameters,
  parseAbiParameters,
  keccak256,
  toBytes,
  zeroAddress,
} from "viem";
import { preview } from "./preview.mjs";
import {
  installMock,
  mockState,
  eventLog,
  m,
  token,
  vault,
  pair,
  u,
  E,
} from "./mock-rpc.mjs";
import { root } from "../scripts/shared.mjs";
const output = join(root, "test/scratch/browser-results");
await mkdir(output, { recursive: true });
const report = {
  checkedAt: new Date().toISOString(),
  mocked: true,
  broadcast: false,
  checks: [],
  limitations: [],
};
const server = await preview();
const browsers = [];
const textVisible = async (page, text) =>
  page.getByText(text, { exact: false }).first().waitFor({ timeout: 15000 });
async function scenario(browser, name, fn, options = {}) {
  if (process.env.TEST_FILTER && !name.includes(process.env.TEST_FILTER))
    return;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const state = mockState(options.state);
    await installMock(page, state, options.wallet ?? {});
    await page.goto(server.url);
    if (!options.skipReady) await textVisible(page, "Vault signal verified");
    await fn(page, state);
    assert.deepEqual(errors, [], "No browser script exceptions");
    report.checks.push({ name, passed: true });
    console.log("PASS", name);
  } catch (e) {
    report.checks.push({ name, passed: false, error: e.message });
    console.error("FAIL", name, e.message);
    await page.screenshot({
      path: join(output, name.replace(/[^a-z0-9]/gi, "-") + "-failure.png"),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
}
async function connect(page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByText("Wallet connected", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Refresh state", exact: true })
    .click();
}
async function prepare(page, answer = " SO REN ") {
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page
    .getByRole("button", { name: "Prepare private guess", exact: true })
    .click();
  await textVisible(page, "Recovery record saved");
  await page.getByLabel(/I saved a recovery backup/).check();
}
async function refreshed(page) {
  await page
    .getByRole("button", { name: "Refresh state", exact: true })
    .click();
}
try {
  const chrome = await chromium.launch({ headless: true });
  browsers.push(chrome);
  await scenario(
    chrome,
    "Disconnected, missing wallet, metadata and responsive first screen",
    async (page) => {
      const initial = await page
        .getByRole("button", { name: "Connect to play", exact: true })
        .boundingBox();
      assert.ok(
        initial.y + initial.height <= 844,
        "Main action on first mobile screen",
      );
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await textVisible(page, "No browser wallet found");
      assert.equal(
        await page.locator('meta[property="og:title"]').getAttribute("content"),
        "SOREN has left the swarm.",
      );
      assert.ok(
        (
          await page
            .locator('meta[property="og:image"]')
            .getAttribute("content")
        ).startsWith("./"),
      );
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const size = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        assert.ok(size.scroll <= size.client, `${width}px no overflow`);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => window.scrollTo(0, 0));
      const box = await page
        .getByRole("button", { name: "Connect to play", exact: true })
        .boundingBox();
      assert.ok(box.width > 0, "Action remains reachable after an error");
      await page.screenshot({ path: join(output, "mobile-disconnected.png") });
    },
    { wallet: { noWallet: true } },
  );
  await scenario(
    chrome,
    "Connection rejection, wrong-chain switch and 4902 add-chain fallback",
    async (page) => {
      await page.evaluate(() => (window.fixture.rejectConnect = true));
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await textVisible(page, "Request rejected");
      await page.evaluate(() => (window.fixture.rejectConnect = false));
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: `Switch to ${m.network.name}`,
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Prepare private guess", exact: true })
          .count(),
        0,
      );
      await page
        .getByRole("button", {
          name: `Switch to ${m.network.name}`,
          exact: true,
        })
        .click();
      await textVisible(page, "Wallet connected");
      const calls = await page.evaluate(() => window.fixture.requests);
      const add = calls.find((c) => c.method === "wallet_addEthereumChain");
      assert.deepEqual(add.params, [m.walletAddChain]);
      assert.equal(
        calls.filter((c) => c.method === "wallet_switchEthereumChain").length,
        2,
      );
    },
    { wallet: { wrongChain: true, unknown: true } },
  );
  await scenario(
    chrome,
    "Approval rejection, pending lock, commit, reload recovery, wrong answer and winning reveal",
    async (page, state) => {
      await connect(page);
      await prepare(page);
      await page.evaluate(() => (window.fixture.rejectSend = true));
      await page
        .getByRole("button", { name: "Approve 100 SORN", exact: true })
        .click();
      await textVisible(page, "Request rejected");
      await page.evaluate(() => (window.fixture.rejectSend = false));
      state.holdReceipt = true;
      await page
        .getByRole("button", { name: "Approve 100 SORN", exact: true })
        .click();
      await textVisible(page, "Guess approval submitted");
      assert.equal(
        await page
          .getByRole("button", {
            name: "Waiting for confirmation…",
            exact: true,
          })
          .isDisabled(),
        true,
      );
      assert.equal(state.writes.length, 1);
      state.holdReceipt = false;
      await page
        .getByRole("button", { name: "Commit & burn 100 SORN", exact: true })
        .waitFor();
      const saved = await page.evaluate(() =>
        Object.keys(localStorage)
          .filter((k) => k.startsWith("soren:"))
          .map((k) => JSON.parse(localStorage[k])),
      );
      assert.equal(saved[0].answer, "soren");
      assert.match(saved[0].secret, /^0x[0-9a-f]{64}$/);
      await page
        .getByRole("button", { name: "Commit & burn 100 SORN", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Reveal answer", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Reveal answer", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(state.burned, 100n * E);
      assert.equal(state.commitHash, saved[0].commitHash);
      await page.screenshot({
        path: join(output, "mobile-committed.png"),
        fullPage: true,
      });
      await page.reload();
      await textVisible(page, "Vault signal verified");
      await connect(page);
      await page
        .getByRole("button", { name: "Reveal answer", exact: true })
        .waitFor();
      state.block++;
      state.time += 12n;
      await refreshed(page);
      await page.waitForFunction(
        () =>
          !Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent === "Reveal answer",
          )?.disabled,
      );
      state.answerHash = keccak256(toBytes("different"));
      await page
        .getByRole("button", { name: "Reveal answer", exact: true })
        .click();
      await textVisible(page, "That answer is incorrect");
      assert.equal(state.writes.length, 2, "Failed simulation sends no reveal");
      state.answerHash = keccak256(toBytes("soren"));
      await page
        .getByRole("button", { name: "Reveal answer", exact: true })
        .click();
      await textVisible(page, "Reveal confirmed");
      await textVisible(page, "DECRYPTED");
      assert.deepEqual(
        state.writes.map((w) => w.functionName),
        ["approve", "commit", "reveal"],
      );
      assert.equal(state.writes[0].args[0].toLowerCase(), vault);
      assert.equal(state.writes[0].args[1], 100n * E);
    },
  );
  await scenario(
    chrome,
    "Storage denied, recovery export and wrong-wallet restore protection",
    async (page, state) => {
      await connect(page);
      await page.getByLabel("Your answer", { exact: true }).fill("soren");
      await page
        .getByRole("button", { name: "Prepare private guess", exact: true })
        .click();
      await textVisible(page, "Browser storage failed");
      assert.equal(
        await page
          .getByRole("button", { name: "Approve 100 SORN", exact: true })
          .isDisabled(),
        true,
      );
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download backup", exact: true })
        .click();
      assert.match((await download).suggestedFilename(), /recovery.json$/);
      await page.getByText("Restore a saved guess", { exact: true }).click();
      await page.getByLabel("Recovery JSON", { exact: true }).fill(
        JSON.stringify({
          version: 1,
          chainId: m.chainId,
          vault,
          wallet: zeroAddress,
          chapter: 1,
          answer: "soren",
          secret: "0x",
        }),
      );
      await page
        .getByRole("button", { name: "Restore recovery", exact: true })
        .click();
      await textVisible(page, "different wallet");
      assert.equal(state.writes.length, 0);
    },
    { wallet: { storageFailure: true } },
  );
  await scenario(
    chrome,
    "Reveal expired and account-change recovery isolation",
    async (page, state) => {
      await connect(page);
      await prepare(page);
      await page
        .getByRole("button", { name: "Approve 100 SORN", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Commit & burn 100 SORN", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Reveal answer", exact: true })
        .waitFor();
      state.block++;
      state.time += 86401n;
      await refreshed(page);
      await textVisible(page, "Reveal window expired");
      assert.equal(
        await page
          .getByRole("button", { name: "Reveal answer", exact: true })
          .isDisabled(),
        true,
      );
      await page.evaluate(
        (account) => window.fixture.emit("accountsChanged", [account]),
        state.owner,
      );
      await page
        .getByRole("button", { name: "Prepare private guess", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Reveal answer", exact: true })
          .count(),
        0,
      );
    },
  );
  await scenario(
    chrome,
    "Owner-only set token, exact approval/fund, browser-hashed publish and hint",
    async (page, state) => {
      assert.equal(
        await page
          .getByRole("heading", { name: "Owner console", exact: true })
          .count(),
        0,
      );
      await connect(page);
      await page
        .getByRole("heading", { name: "Owner console", exact: true })
        .waitFor();
      await page
        .getByLabel("Lock the attested SORN address permanently.")
        .check();
      await page
        .getByRole("button", { name: "Set SORN token", exact: true })
        .click();
      await textVisible(page, "Token configured and permanently locked");
      assert.equal(state.writes[0].args[0].toLowerCase(), token);
      await page.getByLabel("SORN to fund", { exact: true }).fill("5000");
      await page.getByLabel("This deposit can never be withdrawn.").check();
      await page
        .getByRole("button", { name: "Approve funding amount", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Fund vault", exact: true })
        .click();
      await textVisible(page, "Vault funding confirmed");
      await page
        .getByLabel("Correct answer (hashed locally)", { exact: true })
        .fill(" SO REN ");
      await page.getByLabel("Prize in SORN", { exact: true }).fill("5000");
      await page
        .getByLabel("Transmission", { exact: true })
        .fill("Who left the swarm?");
      await page
        .getByLabel(
          "The answer hash, prize, and transmission cannot be changed.",
        )
        .check();
      await page
        .getByRole("button", { name: "Publish chapter", exact: true })
        .click();
      await textVisible(page, "Chapter publication confirmed");
      const published = state.writes.find(
        (w) => w.functionName === "publishChapter",
      );
      assert.equal(published.args[1], keccak256(toBytes("soren")));
      assert.equal(published.args[2], 5000n * E);
      assert.equal(published.args[3], "Who left the swarm?");
      await page
        .getByLabel("Hint text", { exact: true })
        .fill("Listen to the signal.");
      await page
        .getByRole("button", { name: "Post hint", exact: true })
        .click();
      await textVisible(page, "Hint update confirmed");
      assert.equal(state.hint, "Listen to the signal.");
      await page.getByLabel("Hint text", { exact: true }).fill("é".repeat(251));
      assert.equal(
        await page
          .getByRole("button", { name: "Post hint", exact: true })
          .isDisabled(),
        true,
      );
      await page.setViewportSize({ width: 320, height: 900 });
      assert.equal(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        true,
      );
    },
    { state: { ownerWallet: true, configured: false } },
  );
  await scenario(
    chrome,
    "IMD buy, two approvals, simulated router execution and exact pool encoding",
    async (page, state) => {
      await connect(page);
      await page.getByLabel("Pay in IMD", { exact: true }).fill("100");
      await page
        .getByRole("button", { name: "Get quote", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Approve IMD to Permit2", exact: true })
        .waitFor();
      const before = state.writes.length;
      assert.equal(before, 0, "Quote must be eth_call only");
      await page
        .getByRole("button", { name: "Approve IMD to Permit2", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Authorize router via Permit2",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Swap IMD for SORN", exact: true })
        .click();
      await textVisible(page, "Swap confirmed");
      assert.deepEqual(
        state.writes.map((w) => [w.to, w.functionName]),
        [
          [pair, "approve"],
          [u.permit2, "approve"],
          [u.universalRouter, "execute"],
        ],
      );
      assert.equal(state.writes[0].args[0].toLowerCase(), u.permit2);
      assert.equal(state.writes[1].args[1].toLowerCase(), u.universalRouter);
      assert.equal(state.writes[2].value, "0x0");
      const w = state.writes[2];
      assert.equal(w.args[0], "0x10");
      const [actions, params] = decodeAbiParameters(
        parseAbiParameters("bytes,bytes[]"),
        w.args[1][0],
      );
      assert.equal(actions, "0x060c0f");
      const [swap] = decodeAbiParameters(
        parseAbiParameters(
          "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
        ),
        params[0],
      );
      assert.equal(swap.poolKey.hooks.toLowerCase(), m.poolKey.hooks);
      assert.equal(swap.zeroForOne, false);
      assert.equal(swap.amountOutMinimum, 198n * E);
      assert.ok(
        state.calls.some(
          (c) =>
            c.method === "eth_call" &&
            c.params[0].to.toLowerCase() === u.universalRouter,
        ),
        "Router simulated before signing",
      );
    },
  );
  await scenario(
    chrome,
    "Sell SORN, quote invalidation and simulation failure never signs",
    async (page, state) => {
      await connect(page);
      await page
        .getByRole("button", { name: "Sell SORN", exact: true })
        .click();
      await page.getByLabel("Pay in SORN", { exact: true }).fill("10");
      await page
        .getByRole("button", { name: "Get quote", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Approve SORN to Permit2", exact: true })
        .waitFor();
      await page.getByLabel("Pay in SORN", { exact: true }).fill("20");
      assert.equal(
        await page
          .getByRole("button", { name: "Approve SORN to Permit2", exact: true })
          .count(),
        0,
      );
      await page
        .getByRole("button", { name: "Get quote", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Approve SORN to Permit2", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Authorize router via Permit2",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Swap SORN for IMD", exact: true })
        .waitFor();
      state.rejectSimulation = true;
      await page
        .getByRole("button", { name: "Swap SORN for IMD", exact: true })
        .click();
      await page.locator("#swap .action-status.error").waitFor();
      assert.equal(state.writes.length, 2);
    },
  );
  await scenario(
    chrome,
    "Missing deployed code disables writes and recovers on refresh",
    async (page, state) => {
      await textVisible(page, "Deployment could not be verified");
      await connect(page);
      assert.equal(
        await page
          .getByRole("button", { name: "Prepare private guess", exact: true })
          .isDisabled(),
        true,
      );
      state.missingCode = false;
      await refreshed(page);
      await textVisible(page, "Vault signal verified");
    },
    { state: { missingCode: true }, skipReady: true },
  );
  await scenario(
    chrome,
    "Event-derived leaderboard, long values, focus and reduced motion",
    async (page, state) => {
      await connect(page);
      state.guesses = 123456789n;
      state.burned = state.guesses * 100n * E;
      state.balance = 123456789012345678901234n * E;
      state.logs = [eventLog(state)];
      await refreshed(page);
      await page
        .getByText("Explore the guesses & burns leaderboard", { exact: true })
        .click();
      await page
        .getByRole("button", { name: "Scan leaderboard", exact: true })
        .click();
      await textVisible(page, "1 participating wallets found");
      await page.getByLabel("Rank by", { exact: true }).selectOption("burned");
      await page.getByText("Wallet connected", { exact: true }).click();
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
          true,
          `long values at ${width}`,
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(
        () => getComputedStyle(document.activeElement).outlineStyle,
      );
      assert.equal(focus, "solid");
      assert.equal(
        await page.evaluate(
          () =>
            document.getAnimations().filter((a) => a.playState === "running")
              .length,
        ),
        0,
      );
      await page.screenshot({
        path: join(output, "mobile-long-values.png"),
        fullPage: true,
      });
    },
  );
  await scenario(
    chrome,
    "Mined revert has retry feedback without confirmed success",
    async (page, state) => {
      await connect(page);
      await prepare(page);
      state.rejectReceipt = true;
      await page
        .getByRole("button", { name: "Approve 100 SORN", exact: true })
        .click();
      await textVisible(page, "Transaction reverted");
      assert.equal(
        await page
          .getByText("Guess approval confirmed.", { exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Approve 100 SORN", exact: true })
          .isEnabled(),
        true,
      );
    },
  );
  await scenario(
    chrome,
    "Recovery archive restores the mined guess before replacement is submitted",
    async (page, state) => {
      await connect(page);
      await prepare(page);
      await page
        .getByRole("button", { name: "Approve 100 SORN", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Commit & burn 100 SORN", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Reveal answer", exact: true })
        .waitFor();
      await page.getByLabel(/Replace this commitment/).check();
      await page.getByLabel("Your answer", { exact: true }).fill("another");
      await page
        .getByRole("button", { name: "Prepare private guess", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Restore current onchain guess",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Reveal answer", exact: true })
        .waitFor();
      assert.equal(state.writes.length, 2);
      assert.ok(
        await page
          .locator(".guess")
          .textContent()
          .then((t) => t.includes("soren")),
      );
    },
  );
  await scenario(
    chrome,
    "Reload during pending approval requires receipt check and prevents duplicates",
    async (page, state) => {
      await connect(page);
      await prepare(page);
      state.holdReceipt = true;
      await page
        .getByRole("button", { name: "Approve 100 SORN", exact: true })
        .click();
      await textVisible(page, "Guess approval submitted");
      await page.reload();
      await textVisible(page, "Vault signal verified");
      await connect(page);
      await page
        .getByRole("button", { name: "Check pending transaction", exact: true })
        .click();
      await textVisible(page, "Confirmation is still unknown");
      assert.equal(state.writes.length, 1);
      assert.equal(
        await page.locator(".guess button.primary").isDisabled(),
        true,
      );
      state.holdReceipt = false;
      await page
        .getByRole("button", { name: "Check pending transaction", exact: true })
        .click();
      await textVisible(page, "Guess approval confirmed");
      assert.equal(state.writes.length, 1);
      await page.getByLabel(/I saved a recovery backup/).check();
      assert.equal(
        await page
          .getByRole("button", { name: "Commit & burn 100 SORN", exact: true })
          .isEnabled(),
        true,
      );
    },
  );
  await scenario(
    chrome,
    "Account switch during simulation aborts before signing",
    async (page, state) => {
      await connect(page);
      await prepare(page);
      state.pauseFunction = "commit";
      await page
        .getByRole("button", { name: "Commit & burn 100 SORN", exact: true })
        .click();
      for (let i = 0; i < 100 && !state.simulationStarted; i++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.ok(state.simulationStarted);
      await page.evaluate(
        (account) => window.fixture.emit("accountsChanged", [account]),
        state.owner,
      );
      state.resumeSimulation();
      await textVisible(page, "Wallet or network changed");
      assert.equal(state.writes.length, 0);
    },
    { state: { allowance: 100n * E } },
  );
  await scenario(
    chrome,
    "RPC outage keeps amounts unknown and retry recovers",
    async (page, state) => {
      await textVisible(page, "Signal unavailable");
      await connect(page);
      assert.equal(
        await page.locator(".guess button.primary").isDisabled(),
        true,
      );
      state.rpcFailure = false;
      await refreshed(page);
      await textVisible(page, "Vault signal verified");
      assert.equal(state.writes.length, 0);
    },
    { state: { rpcFailure: true }, skipReady: true },
  );
  await scenario(
    chrome,
    "ABI tampering is rejected before wallet use",
    async (page) => {
      await page.route("**/abi/SorenVault.json", (route) =>
        route.fulfill({ json: [] }),
      );
      await page.reload();
      await textVisible(page, "ABI verification failed for SorenVault");
      assert.equal(
        await page
          .getByRole("button", { name: "Connect wallet", exact: true })
          .count(),
        0,
      );
    },
  );
  await scenario(
    chrome,
    "Quote expiry and transmission disclosure respect live controls",
    async (page) => {
      await connect(page);
      await page.getByLabel("Pay in IMD", { exact: true }).fill("1");
      await page
        .getByRole("button", { name: "Get quote", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Approve IMD to Permit2", exact: true })
        .waitFor();
      await page.evaluate(() => {
        const original = Date.now;
        Date.now = () => original() + 65000;
      });
      await textVisible(page, "Quote expired");
      assert.equal(
        await page
          .getByRole("button", { name: "Approve IMD to Permit2", exact: true })
          .isDisabled(),
        true,
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.locator(".transcript > summary").click();
      await page
        .getByRole("button", { name: "Show full transmission", exact: true })
        .click();
      assert.ok(
        await page
          .locator('.transmission-text[aria-hidden="true"]')
          .textContent()
          .then((t) => t.includes("What do I call myself?")),
      );
      await page
        .getByText("All seven transmission records", { exact: true })
        .click();
      assert.equal(await page.locator(".chapter-record").count(), 7);
    },
  );
  await scenario(
    chrome,
    "Selected discovered wallet is honored by the main connection action",
    async (page) => {
      await page.evaluate(() => {
        const original = window.ethereum;
        const provider = {
          request: async (args) => {
            window.fixture.choice = "second";
            return original.request(args);
          },
          on: original.on,
          removeListener: original.removeListener,
        };
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: { uuid: "fixture-second-wallet", name: "Fixture wallet B" },
              provider,
            },
          }),
        );
      });
      await page
        .getByLabel("Select wallet", { exact: true })
        .selectOption("fixture-second-wallet");
      await page
        .getByRole("button", { name: "Connect to play", exact: true })
        .click();
      await page.getByText("Wallet connected", { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.fixture.choice), "second");
    },
  );
  let safari;
  try {
    safari = await webkit.launch({ headless: true, timeout: 10000 });
    browsers.push(safari);
  } catch (e) {
    report.limitations.push(
      `WebKit did not launch: ${e.message
        .split("\n")
        .filter((x) => x.includes("lib") || x.includes("Host system"))
        .join(" ")
        .slice(0, 1000)}`,
    );
  }
  if (safari)
    await scenario(
      safari,
      "WebKit wallet, mobile reflow and prepare/approve/commit/reveal",
      async (page, state) => {
        await connect(page);
        await prepare(page);
        await page
          .getByRole("button", { name: "Approve 100 SORN", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Commit & burn 100 SORN", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Reveal answer", exact: true })
          .waitFor();
        state.block++;
        state.time += 12n;
        await refreshed(page);
        await page
          .getByRole("button", { name: "Reveal answer", exact: true })
          .click();
        await textVisible(page, "Reveal confirmed");
        for (const width of [320, 390, 1440]) {
          await page.setViewportSize({ width, height: 844 });
          assert.equal(
            await page.evaluate(
              () =>
                document.documentElement.scrollWidth <=
                document.documentElement.clientWidth,
            ),
            true,
          );
        }
      },
    );
} finally {
  for (const b of browsers) await b.close();
  await server.close();
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(JSON.stringify(report, null, 2));
if (report.checks.some((c) => !c.passed)) process.exitCode = 1;
