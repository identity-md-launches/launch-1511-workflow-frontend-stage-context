import { readJSON, root } from "./shared.mjs";
import { join } from "node:path";
const m = await readJSON(join(root, "dist/imd-deployment.json"));
const results = [];
for (const url of m.network.rpcUrls) {
  const result = { rpc: url, checkedAt: new Date().toISOString() };
  try {
    const calls = [
      { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
      ...m.contracts.map((c, i) => ({
        jsonrpc: "2.0",
        id: i + 2,
        method: "eth_getCode",
        params: [c.address, "latest"],
      })),
    ];
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(calls),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const responses = await r.json();
    if (!Array.isArray(responses)) throw new Error("RPC refused batched reads");
    result.chainId = Number(responses.find((x) => x.id === 1)?.result);
    result.contracts = m.contracts.map((c, i) => {
      const res = responses.find((x) => x.id === i + 2);
      return {
        name: c.name,
        nonemptyCode: !!res?.result && res.result !== "0x",
        codeBytes: res?.result ? (res.result.length - 2) / 2 : 0,
        error: res?.error?.message,
      };
    });
    result.verified =
      result.chainId === m.chainId &&
      result.contracts.every((c) => c.nonemptyCode);
  } catch (e) {
    result.verified = false;
    result.error = e.message;
  }
  results.push(result);
}
console.log(
  JSON.stringify({ readOnly: true, broadcast: false, results }, null, 2),
);
