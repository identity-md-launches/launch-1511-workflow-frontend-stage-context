import { join } from "node:path";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { root, dist, readJSON, verifyManifest } from "./shared.mjs";
const m = await readJSON(join(dist, "imd-deployment.json"));
const source = await readJSON(join(root, "web/deployment.source.json"));
const { assets, ...config } = m;
assert.deepEqual(config, source);
if (existsSync(join(root, ".imd/reads/deployment.json"))) {
  const h = await readJSON(join(root, ".imd/reads/deployment.json"));
  for (const k of [
    "version",
    "launchId",
    "chainId",
    "sourceCommit",
    "attestationHash",
    "poolKey",
  ])
    assert.deepEqual(m[k], h[k], k);
  assert.deepEqual(
    m.contracts.map(({ abiPath, ...c }) => c),
    h.contracts.map(({ name, address, abiHash }) => ({
      name,
      address,
      abiHash,
    })),
  );
  const n = await readJSON(join(root, ".imd/reads/network.json"));
  assert.deepEqual(m.network, n.network);
  assert.deepEqual(m.walletAddChain, n.walletAddChain);
}
console.log(
  JSON.stringify({ ok: true, ...(await verifyManifest(m)) }, null, 2),
);
