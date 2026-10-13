import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { preview } from "./preview.mjs";
import { mockState, installMock } from "./mock-rpc.mjs";
import { root } from "../scripts/shared.mjs";
const output = join(root, "test/scratch/keyboard");
await mkdir(output, { recursive: true });
const server = await preview(),
  browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const state = mockState();
const report = {
  checkedAt: new Date().toISOString(),
  mocked: true,
  broadcast: false,
  passed: false,
  steps: [],
};
async function tabTo(selector, text = "") {
  for (let i = 0; i < 100; i++) {
    await page.keyboard.press("Tab");
    if (
      await page.evaluate(
        ({ selector, text }) => {
          const e = document.activeElement;
          return (
            e?.matches(selector) &&
            (!text ||
              e.textContent?.includes(text) ||
              e.closest("label")?.textContent?.includes(text))
          );
        },
        { selector, text },
      )
    )
      return;
  }
  throw new Error(`Could not reach ${selector} ${text} with Tab`);
}
try {
  await installMock(page, state);
  await page.goto(server.url);
  await page.getByText("Vault signal verified", { exact: false }).waitFor();
  await tabTo("button", "Connect wallet");
  await page.keyboard.press("Enter");
  await page.getByText("Wallet connected", { exact: true }).waitFor();
  report.steps.push("Connect wallet with Tab + Enter");
  await page.waitForFunction(() => {
    const input = document.getElementById("guess-answer");
    return input && !input.disabled;
  });
  await tabTo("#guess-answer");
  await page.keyboard.type(" SO REN ");
  await tabTo("button", "Prepare private guess");
  await page.keyboard.press("Enter");
  await tabTo('input[type="checkbox"]', "I saved a recovery");
  await page.keyboard.press("Space");
  await tabTo("button", "Approve 100 SORN");
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.activeElement).outlineWidth,
    ),
    "2px",
  );
  await page.screenshot({ path: join(output, "keyboard-focus.png") });
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Commit & burn 100 SORN", exact: true })
    .waitFor();
  report.steps.push(
    "Normalize answer, prepare, acknowledge backup, and approve by keyboard",
  );
  await tabTo("button", "Commit & burn 100 SORN");
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Reveal answer", exact: true })
    .waitFor();
  state.block++;
  state.time += 12n;
  await tabTo("button", "Refresh state");
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find(
        (e) => e.textContent === "Reveal answer",
      )?.disabled,
  );
  await tabTo("button", "Reveal answer");
  await page.keyboard.press("Enter");
  await page.getByText("Reveal confirmed.", { exact: false }).waitFor();
  report.steps.push(
    "Commit, refresh after a later block, and reveal by keyboard",
  );
  assert.deepEqual(
    state.writes.map((w) => w.functionName),
    ["approve", "commit", "reveal"],
  );
  // Browser text enlargement is measured separately from unperformed native UI zoom.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  report.textEnlargement = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: Array.from(document.querySelectorAll("body *"))
      .filter(
        (e) =>
          e.getBoundingClientRect().right >
          document.documentElement.clientWidth + 1,
      )
      .map((e) => ({
        tag: e.tagName,
        css: e.className,
        text: e.textContent.slice(0, 60),
        right: e.getBoundingClientRect().right,
      }))
      .slice(0, 15),
  }));
  await page.screenshot({
    path: join(output, "text-enlargement.png"),
    fullPage: true,
  });
  assert.equal(
    report.textEnlargement.scrollWidth <= report.textEnlargement.width,
    true,
  );
  report.steps.push(
    "200% root text enlargement at 390px, no horizontal scroll",
  );
  report.passed = true;
} finally {
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await server.close();
}
console.log(JSON.stringify(report, null, 2));
