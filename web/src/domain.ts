import {
  decodeErrorResult,
  parseAbi,
  encodeAbiParameters,
  keccak256,
  toBytes,
  toHex,
  parseUnits,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
export const normalizeAnswer = (text: string) =>
  text.toLowerCase().trim().replace(/\s+/gu, "");
export const answerHash = (text: string) =>
  keccak256(toBytes(normalizeAnswer(text)));
export const commitHash = (answer: string, wallet: Address, secret: Hex) =>
  keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }, { type: "bytes32" }],
      [answer, wallet, secret],
    ),
  );
export const randomSecret = () =>
  toHex(crypto.getRandomValues(new Uint8Array(32)));
export const bytesLength = (text: string) =>
  new TextEncoder().encode(text).length;
export function amount(text: string, decimals = 18): bigint | null {
  if (
    !/^\d+(\.\d*)?$/.test(text) ||
    (text.split(".")[1]?.length ?? 0) > decimals
  )
    return null;
  try {
    const n = parseUnits(text, decimals);
    return n > 0n && n < 1n << 128n ? n : null;
  } catch {
    return null;
  }
}
export function units(value: bigint | undefined, decimals = 18) {
  if (value === undefined) return "…";
  const [a, b] = formatUnits(value, decimals).split(".");
  return a.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (b ? "." + b : "");
}
export type Recovery = {
  version: 1;
  chainId: number;
  vault: Address;
  wallet: Address;
  chapter: number;
  answer: string;
  secret: Hex;
  commitHash: Hex;
};
export const recoveryKey = (
  chainId: number,
  vault: Address,
  wallet: Address,
  chapter: number,
) =>
  `soren:v1:${chainId}:${vault.toLowerCase()}:${wallet.toLowerCase()}:${chapter}`;
export function parseRecovery(
  text: string,
  expected: {
    chainId: number;
    vault: Address;
    wallet: Address;
    chapter: number;
  },
): Recovery {
  const r = JSON.parse(text) as Recovery;
  if (
    r.version !== 1 ||
    r.chainId !== expected.chainId ||
    r.vault?.toLowerCase() !== expected.vault.toLowerCase() ||
    r.wallet?.toLowerCase() !== expected.wallet.toLowerCase() ||
    r.chapter !== expected.chapter
  )
    throw new Error(
      "This recovery record belongs to a different wallet, vault, chain, or chapter.",
    );
  if (
    typeof r.answer !== "string" ||
    !/^0x[\da-f]{64}$/i.test(r.secret) ||
    commitHash(r.answer, r.wallet, r.secret) !== r.commitHash
  )
    throw new Error("Recovery record is damaged. Paste the original JSON.");
  return r;
}
export const sameAddress = (a: string | undefined, b: string | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export function revealState(
  commit: { hash: Hex; block: bigint; timestamp: bigint } | undefined,
  recovery: Recovery | null,
  block: bigint,
  time: bigint,
  window: bigint,
  open: boolean,
) {
  if (!open) return "Chapter is not open.";
  if (!commit || /^0x0+$/.test(commit.hash)) return "Commit an answer first.";
  if (!recovery || commit.hash !== recovery.commitHash)
    return "Restore the recovery record for your onchain commitment.";
  if (time > commit.timestamp + window)
    return "Reveal window expired. A new guess costs another commit.";
  if (block <= commit.block) return "Waiting for the next block.";
  return null;
}
const protocolErrors = parseAbi([
  "error V4TooLittleReceived(uint256 minAmountOutReceived,uint256 amountReceived)",
  "error V4TooMuchRequested(uint256 maxAmountInRequested,uint256 amountRequested)",
  "error AllowanceExpired(uint256 deadline)",
  "error InsufficientAllowance(uint256 amount)",
  "error TransactionDeadlinePassed()",
]);
export function readableError(error: unknown): string {
  const texts: string[] = [];
  let cur = error as {
    message?: string;
    shortMessage?: string;
    code?: number;
    reason?: string;
    data?: { errorName?: string; args?: readonly unknown[] };
    cause?: unknown;
  };
  for (let i = 0; cur && i < 8; i++, cur = cur.cause as typeof cur) {
    if (cur.code === 4001)
      return "Request rejected in your wallet. You can try again.";
    if (
      cur.data?.errorName === "ExecutionFailed" &&
      typeof cur.data.args?.[1] === "string"
    ) {
      try {
        const nested = decodeErrorResult({
          abi: protocolErrors,
          data: cur.data.args[1] as Hex,
        });
        texts.push(nested.errorName);
      } catch {
        /* Unknown protocol errors retain a safe router-specific explanation. */
      }
    }
    if (
      cur.reason &&
      cur.reason !== "execution reverted" &&
      !/^0x[0-9a-f]+$/i.test(cur.reason)
    )
      texts.push(`reason:${cur.reason.slice(0, 180)}`);
    texts.push(
      cur.data?.errorName ?? "",
      cur.shortMessage ?? "",
      cur.message ?? "",
    );
  }
  const text = texts.join(" ");
  const messages: Record<string, string> = {
    V4TooLittleReceived:
      "The pool would return less than your minimum. Refresh the quote or review slippage.",
    V4TooMuchRequested:
      "The pool requires more than the permitted input. Refresh the quote.",
    AllowanceExpired:
      "Permit2 authorization expired. Refresh the quote and authorize the router again.",
    InsufficientAllowance:
      "The router authorization is too small. Refresh the quote and approve the current amount.",
    TransactionDeadlinePassed: "The swap deadline passed. Get a fresh quote.",
    IncorrectAnswer:
      "That answer is incorrect. The 100 SORN burn cannot be refunded.",
    RevealTooEarly: "Wait for a block after your commit, then retry.",
    RevealExpired: "The 24-hour reveal window has expired.",
    CommitmentMismatch:
      "Your recovery record does not match the latest commitment.",
    ChapterNotOpen:
      "This chapter is no longer open. Refresh to see its solver.",
    PreviousChapterUnsolved:
      "Solve the previous chapter before publishing the next.",
    InsufficientFunding: "Fund the vault before publishing this prize.",
    TokenNotConfigured: "The owner must configure SORN before play begins.",
    TokenAlreadySet: "The token has already been set and is locked.",
    Unauthorized: "This action is available only to the vault owner.",
    ERC20InsufficientBalance: "Your token balance is too low for this action.",
    ERC20InsufficientAllowance:
      "Approve the required token amount, then retry.",
    NoCommitment: "This wallet has no commitment for this chapter.",
    ChapterOutOfOrder: "Publish the next sequential chapter.",
    TransmissionTooLong: "Keep the transmission within 2,000 UTF-8 bytes.",
    HintTooLong: "Keep the hint within 500 UTF-8 bytes.",
    InvalidAmount: "Enter a positive amount within the token precision.",
    UserRejectedRequestError:
      "Request rejected in your wallet. You can try again.",
    TransactionReceiptRevertedError:
      "The transaction reverted. Refresh state before trying again.",
  };
  for (const [name, message] of Object.entries(messages))
    if (text.includes(name)) return message;
  const reason = texts.find((t) => t.startsWith("reason:"));
  if (reason)
    return `Simulation reverted: ${reason.slice(7).replace(/^execution reverted:?\s*/i, "")}. Refresh state before retrying.`;
  if (/insufficient funds/i.test(text))
    return "Not enough funds for the amount or network gas. Check your wallet.";
  if (text.includes("ExecutionFailed"))
    return "The router rejected this swap during simulation. Refresh the quote and check your token approvals; no swap was signed.";
  if (
    error instanceof Error &&
    !("shortMessage" in error) &&
    !error.message.includes("http") &&
    error.message.length < 220
  )
    return error.message;
  return "The request could not complete. Check your network and balances, refresh state, then retry.";
}
