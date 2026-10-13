import { createPublicClient, http } from "viem";
import { quoterAbi, erc20Abi } from "../src/protocol.ts";
import { readableError } from "../src/domain.ts";
import { readJSON, root } from "./shared.mjs";
import { join } from "node:path";
const m = await readJSON(join(root, "dist/imd-deployment.json"));
const client = createPublicClient({
  transport: http(m.network.rpcUrls[0], { timeout: 15000, retryCount: 0 }),
});
const result = {
  checkedAt: new Date().toISOString(),
  readOnly: true,
  broadcast: false,
  contracts: [],
  quote: null,
};
for (const [name, address] of Object.entries(m.network.uniswapV4).filter(
  ([, v]) => typeof v === "string",
)) {
  const code = await client.getCode({ address });
  result.contracts.push({
    name,
    address,
    nonemptyCode: !!code && code !== "0x",
  });
}
const pair = m.network.pairToken;
result.pair = {
  address: pair.address,
  symbol: await client.readContract({
    address: pair.address,
    abi: erc20Abi,
    functionName: "symbol",
  }),
  decimals: await client.readContract({
    address: pair.address,
    abi: erc20Abi,
    functionName: "decimals",
  }),
};
try {
  const q = await client.simulateContract({
    address: m.network.uniswapV4.quoter,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        poolKey: m.poolKey,
        zeroForOne:
          pair.address.toLowerCase() === m.poolKey.currency0.toLowerCase(),
        exactAmount: 10n ** BigInt(pair.decimals),
        hookData: "0x",
      },
    ],
  });
  result.quote = {
    input: `1 ${pair.symbol}`,
    amountOut: q.result[0].toString(),
    gasEstimate: q.result[1].toString(),
    mode: "eth_call only",
  };
} catch (e) {
  result.quote = {
    input: `1 ${pair.symbol}`,
    available: false,
    reason: readableError(e),
    mode: "eth_call only",
  };
}
console.log(JSON.stringify(result, null, 2));
