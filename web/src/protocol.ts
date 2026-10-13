import {
  encodeAbiParameters,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
  type Address,
} from "viem";
import type { PoolKey } from "./config";
export const erc20Abi = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
export const permit2Abi = parseAbi([
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
export const routerAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
  "error ExecutionFailed(uint256 commandIndex,bytes message)",
  "error TransactionDeadlinePassed()",
]);
export const quoterAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
export function swapPayload(
  poolKey: PoolKey,
  input: Address,
  amountIn: bigint,
  minimum: bigint,
  extended = false,
) {
  if (
    input.toLowerCase() !== poolKey.currency0.toLowerCase() &&
    input.toLowerCase() !== poolKey.currency1.toLowerCase()
  )
    throw new Error("Input currency is not in the attested pool.");
  const zeroForOne = input.toLowerCase() === poolKey.currency0.toLowerCase();
  const output = zeroForOne ? poolKey.currency1 : poolKey.currency0;
  const tuple = `((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,${extended ? "uint256 minHopPriceX36," : ""}bytes hookData)`;
  const values = extended
    ? [poolKey, zeroForOne, amountIn, minimum, 0n, "0x"]
    : [poolKey, zeroForOne, amountIn, minimum, "0x"];
  const params = [
    encodeAbiParameters(parseAbiParameters(tuple), [values]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      input,
      amountIn,
    ]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      output,
      minimum,
    ]),
  ];
  return {
    commands: "0x10" as const,
    inputs: [
      encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
        "0x060c0f",
        params,
      ]),
    ],
    value: input === zeroAddress ? amountIn : 0n,
    zeroForOne,
    output,
  };
}
export function minimumOutput(quote: bigint, slippageBps: number) {
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 500)
    throw new Error("Use slippage from 0.01% to 5%.");
  return (quote * BigInt(10000 - slippageBps)) / 10000n;
}
