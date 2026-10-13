import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import {
  root,
  dist,
  readJSON,
  files,
  sha256,
  abiHash,
  verifyManifest,
} from "./shared.mjs";
const config = await readJSON(join(root, "web/deployment.source.json"));
for (const contract of config.contracts) {
  const path = `docs/abi/${contract.name}.json`;
  const pinned = execFileSync(
    "git",
    ["show", `${config.sourceCommit}:${path}`],
    { cwd: root, encoding: "utf8" },
  );
  const delivered = await readFile(join(root, path), "utf8");
  if (abiHash(JSON.parse(pinned)) !== contract.abiHash || delivered !== pinned)
    throw new Error(`Pinned ABI mismatch: ${contract.name}`);
  const dest = join(dist, contract.abiPath);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, pinned);
}
const assets = [];
for (const path of (await files(dist)).filter(
  (p) => p !== "imd-deployment.json",
))
  assets.push({ path, sha256: sha256(await readFile(join(dist, path))) });
const manifest = { ...config, assets };
await writeFile(
  join(dist, "imd-deployment.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("Export verified:", await verifyManifest(manifest));
