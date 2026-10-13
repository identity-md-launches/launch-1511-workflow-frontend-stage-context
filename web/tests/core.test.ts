import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import {
  normalizeAnswer,
  answerHash,
  commitHash,
  parseRecovery,
  recoveryKey,
  revealState,
  amount,
  bytesLength,
  readableError,
  type Recovery,
} from "../src/domain.ts";
import { swapPayload, minimumOutput } from "../src/protocol.ts";
import { canonical } from "../src/config.ts";
const deployment = JSON.parse(
  readFileSync(new URL("../deployment.source.json", import.meta.url), "utf8"),
);
const wallet = `0x${randomBytes(20).toString("hex")}` as Address;
const other = `0x${randomBytes(20).toString("hex")}` as Address;
const secret = `0x${randomBytes(32).toString("hex")}` as Hex;
const vault = deployment.contracts.find(
  (c: { name: string }) => c.name === "SorenVault",
).address;
const makeRecord = (): Recovery => ({
  version: 1,
  chainId: deployment.chainId,
  vault,
  wallet,
  chapter: 1,
  answer: "soren",
  secret,
  commitHash: commitHash("soren", wallet, secret),
});
test("owner and player normalize case and all ECMAScript whitespace identically", () => {
  assert.equal(normalizeAnswer("  SO\tR E\nN\u00a0"), "soren");
  assert.equal(answerHash(" SO REN "), keccak256(toBytes("soren")));
  assert.notEqual(normalizeAnswer("é"), normalizeAnswer("e\u0301")); // Deliberately no Unicode normalization.
});
test("commit uses abi.encode with sender binding and 32-byte entropy", () => {
  assert.equal(
    commitHash("soren", wallet, secret),
    keccak256(
      encodeAbiParameters(parseAbiParameters("string,address,bytes32"), [
        "soren",
        wallet,
        secret,
      ]),
    ),
  );
  assert.notEqual(
    commitHash("soren", wallet, secret),
    commitHash("soren", other, secret),
  );
});
test("recovery is bound to chain/vault/wallet/chapter and rejects tampering", () => {
  const r = makeRecord();
  assert.deepEqual(parseRecovery(JSON.stringify(r), r), r);
  for (const changed of [
    { chainId: r.chainId + 1 },
    { wallet: other },
    { vault: other },
    { chapter: 2 },
    { secret: "0x11" },
    { answer: "altered" },
  ])
    assert.throws(() => parseRecovery(JSON.stringify({ ...r, ...changed }), r));
  assert.notEqual(
    recoveryKey(1, vault, wallet, 1),
    recoveryKey(1, vault, wallet, 2),
  );
});
test("reveal eligibility covers same block, exact deadline, expiry, mismatch and solved chapter", () => {
  const r = makeRecord(),
    c = { hash: r.commitHash, block: 10n, timestamp: 1000n },
    window = 86400n;
  assert.match(revealState(c, r, 10n, 1001n, window, true)!, /next block/);
  assert.equal(revealState(c, r, 11n, 1000n + window, window, true), null);
  assert.match(
    revealState(c, r, 11n, 1001n + window, window, true)!,
    /expired/,
  );
  assert.match(revealState(c, null, 11n, 1001n, window, true)!, /Restore/);
  assert.match(revealState(c, r, 11n, 1001n, window, false)!, /not open/);
});
test("amount validation never rounds away excess decimals or accepts exponent/negative input", () => {
  assert.equal(amount("1.000001", 6), 1000001n);
  for (const s of ["1.0000001", "-1", "0", "1e3", "NaN", ".", "Infinity"])
    assert.equal(amount(s, 6), null);
  assert.equal(amount((1n << 128n).toString(), 0), null);
  assert.equal(bytesLength("é"), 2);
});
test("minimum quote output floors slippage safely and rejects permissive limits", () => {
  assert.equal(minimumOutput(1001n, 100), 990n);
  for (const bps of [0, 501, NaN, 1.5])
    assert.throws(() => minimumOutput(1000n, bps));
});
test("router encoding copies the entire handoff poolKey and selects sorted currency direction", () => {
  const p = deployment.poolKey;
  for (const input of [p.currency0, p.currency1])
    for (const extended of [false, true]) {
      const payload = swapPayload(p, input, 100n, 90n, extended);
      assert.equal(payload.commands, "0x10");
      assert.equal(payload.value, 0n);
      const [actions, params] = decodeAbiParameters(
        parseAbiParameters("bytes,bytes[]"),
        payload.inputs[0],
      );
      assert.equal(actions, "0x060c0f");
      const [decoded] = decodeAbiParameters(
        parseAbiParameters(
          `((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,${extended ? "uint256 minHopPriceX36," : ""}bytes hookData)`,
        ),
        params[0],
      ) as any;
      assert.equal(decoded.poolKey.hooks.toLowerCase(), p.hooks);
      assert.equal(decoded.poolKey.currency0.toLowerCase(), p.currency0);
      assert.equal(decoded.poolKey.currency1.toLowerCase(), p.currency1);
      assert.equal(decoded.poolKey.fee, p.fee);
      assert.equal(decoded.poolKey.tickSpacing, p.tickSpacing);
      assert.equal(decoded.zeroForOne, input === p.currency0);
      assert.equal(decoded.amountOutMinimum, 90n);
      if (extended) assert.equal(decoded.minHopPriceX36, 0n);
      assert.deepEqual(
        decodeAbiParameters(
          parseAbiParameters("address,uint256"),
          params[1],
        ).map((x) => (typeof x === "string" ? x.toLowerCase() : x)),
        [input, 100n],
      );
    }
});
test("runtime canonical ABI hashes match both handoff contracts", () => {
  for (const c of deployment.contracts) {
    const abi = JSON.parse(
      readFileSync(
        new URL(`../../docs/abi/${c.name}.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(
      keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2),
      c.abiHash,
    );
  }
});
test("readable failures decode nested custom errors and user rejection", () => {
  assert.match(
    readableError({ cause: { data: { errorName: "IncorrectAnswer" } } }),
    /incorrect/,
  );
  assert.match(readableError({ cause: { code: 4001 } }), /rejected/);
});

test("native input sends value and needs no token settlement transfer", () => {
  const zero = "0x0000000000000000000000000000000000000000" as Address;
  const p = { ...deployment.poolKey, currency0: zero };
  const result = swapPayload(p, zero, 100n, 90n);
  assert.equal(result.value, 100n);
  assert.equal(result.zeroForOne, true);
  assert.throws(() => swapPayload(p, other, 100n, 90n));
});
test("explicit revert reason is retained without exposing a raw selector", () => {
  assert.match(
    readableError({ cause: { reason: "pool is paused" } }),
    /pool is paused/,
  );
  assert.doesNotMatch(
    readableError({ cause: { reason: "0x12345678" } }),
    /0x12345678/,
  );
});
