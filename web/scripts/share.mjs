import { chromium } from "playwright";
import { root } from "./shared.mjs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    await readFile(join(root, "web/assets/share.svg"), "utf8"),
  );
  await page.addStyleTag({ content: "body{margin:0;}svg{display:block}" });
  await page.screenshot({ path: join(root, "web/public/share.png") });
} finally {
  await browser.close();
}
