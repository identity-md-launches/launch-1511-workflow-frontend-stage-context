import { useEffect, useRef, useState } from "react";
import { zeroAddress, type Address } from "viem";
import { contractOf, type Runtime } from "./config";
import { amount, readableError, sameAddress, units } from "./domain";
import {
  erc20Abi,
  minimumOutput,
  permit2Abi,
  quoterAbi,
  routerAbi,
  swapPayload,
} from "./protocol";
import type { Transactions, Vault, Wallet } from "./session";
import { ActionButton, Field, Status, WalletGate } from "./ui";
type Quote = {
  out: bigint;
  minimum: bigint;
  balance: bigint;
  allowance: bigint;
  permit: bigint;
  expiration: bigint;
  time: bigint;
  at: number;
  input: Address;
  output: Address;
  amount: bigint;
  key: string;
};
export function Swap({
  runtime,
  wallet,
  vault,
  tx,
}: {
  runtime: Runtime;
  wallet: Wallet;
  vault: Vault;
  tx: Transactions;
}) {
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [text, setText] = useState("");
  const [slip, setSlip] = useState("1");
  const [quote, setQuote] = useState<Quote>();
  const [error, setError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [tick, setTick] = useState(Date.now());
  const sequence = useRef(0);
  const d = runtime.deployment,
    n = d.network,
    p = d.poolKey,
    u = n.uniswapV4,
    t = contractOf(runtime, "LaunchToken");
  const paired = p
    ? sameAddress(p.currency0, t.address)
      ? p.currency1
      : p.currency0
    : undefined;
  const native = paired === zeroAddress;
  const pairMeta = native
    ? n.nativeCurrency
    : [n.pairToken, ...(n.otherPairTokens ?? [])].find(
        (x) => x && sameAddress(x.address, paired),
      );
  const available =
    !!p &&
    !!u &&
    !!pairMeta &&
    (sameAddress(p.currency0, t.address) ||
      sameAddress(p.currency1, t.address));
  const input = direction === "buy" ? paired! : t.address,
    output = direction === "buy" ? t.address : paired!;
  const inDecimals = direction === "buy" ? (pairMeta?.decimals ?? 18) : 18,
    outDecimals = direction === "buy" ? 18 : (pairMeta?.decimals ?? 18);
  const inSymbol = direction === "buy" ? pairMeta?.symbol : "SORN",
    outSymbol = direction === "buy" ? "SORN" : pairMeta?.symbol;
  const value = amount(text, inDecimals);
  const bps = Number(slip) * 100;
  const key = [wallet.address, wallet.chainId, direction, text, slip].join(":");
  const currentKey = useRef(key);
  currentKey.current = key;
  useEffect(() => {
    sequence.current++;
    setQuote(undefined);
    setError("");
    setQuoting(false);
  }, [key]);
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function getQuote() {
    if (
      !available ||
      !value ||
      !wallet.address ||
      !wallet.correct ||
      !vault.verified ||
      !p ||
      !u
    )
      return;
    const seq = ++sequence.current;
    setQuoting(true);
    setError("");
    setQuote(undefined);
    try {
      if (!Number.isInteger(bps) || bps < 1 || bps > 500)
        throw new Error("Use slippage from 0.01% to 5%.");
      const block = await vault.client.getBlock();
      const required = [
        u.universalRouter,
        u.quoter,
        u.permit2,
        u.poolManager,
        ...(paired !== zeroAddress ? [paired!] : []),
      ];
      const code = await Promise.all(
        required.map((address) => vault.client.getCode({ address })),
      );
      if (code.some((c) => !c || c === "0x"))
        throw new Error(
          "Swap contracts could not be verified. Swaps are disabled.",
        );
      if (!native) {
        const [decimals, symbol] = await Promise.all([
          vault.client.readContract({
            address: paired!,
            abi: erc20Abi,
            functionName: "decimals",
          }),
          vault.client.readContract({
            address: paired!,
            abi: erc20Abi,
            functionName: "symbol",
          }),
        ]);
        if (decimals !== pairMeta?.decimals || symbol !== pairMeta.symbol)
          throw new Error(
            "The pair token does not match the network configuration.",
          );
      }
      const result = await vault.client.simulateContract({
        address: u.quoter,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: p,
            zeroForOne: sameAddress(input, p.currency0),
            exactAmount: value,
            hookData: "0x",
          },
        ],
        account: wallet.address,
      });
      const [out] = result.result;
      if (out >= 1n << 128n)
        throw new Error(
          "Quoted output is too large for a single swap. Reduce the input amount.",
        );
      if (out <= 0n)
        throw new Error(
          "No output available. The pool may not have liquidity.",
        );
      const minimum = minimumOutput(out, bps);
      if (minimum <= 0n)
        throw new Error("Amount is too small for this slippage setting.");
      const balance =
        input === zeroAddress
          ? await vault.client.getBalance({ address: wallet.address })
          : await vault.client.readContract({
              address: input,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [wallet.address],
            });
      let allowance = value,
        permit = value,
        expiration = block.timestamp + 3600n;
      if (input !== zeroAddress) {
        allowance = await vault.client.readContract({
          address: input,
          abi: erc20Abi,
          functionName: "allowance",
          args: [wallet.address, u.permit2],
        });
        [permit, expiration] = await vault.client.readContract({
          address: u.permit2,
          abi: permit2Abi,
          functionName: "allowance",
          args: [wallet.address, input, u.universalRouter],
        });
      }
      if (seq === sequence.current && key === currentKey.current)
        setQuote({
          out,
          minimum,
          balance,
          allowance,
          permit,
          expiration,
          time: block.timestamp,
          at: Date.now(),
          input,
          output,
          amount: value,
          key,
        });
    } catch (e) {
      if (seq === sequence.current)
        setError(`Quote unavailable. ${readableError(e)}`);
    } finally {
      if (seq === sequence.current) setQuoting(false);
    }
  }
  const fresh = quote && quote.key === key && tick - quote.at < 60000;
  const needsToken =
    quote && input !== zeroAddress && quote.allowance < quote.amount;
  const needsPermit =
    quote &&
    input !== zeroAddress &&
    (quote.permit < quote.amount || quote.expiration <= quote.time + 120n);
  const enabled =
    available && wallet.correct && vault.verified && !tx.busy && !quoting;
  const execute = async () => {
    if (!fresh || !quote || !p || !u) return;
    const payload = swapPayload(
      p,
      input,
      quote.amount,
      quote.minimum,
      !!u.extendedSwapParams,
    );
    if (
      await tx.run("swap", "Swap", {
        address: u.universalRouter,
        abi: routerAbi,
        functionName: "execute",
        args: [payload.commands, payload.inputs, quote.time + 1200n],
        value: payload.value,
      })
    )
      setQuote(undefined);
  };
  return (
    <section className="section swap" id="swap" aria-labelledby="swap-title">
      <div className="section-heading">
        <h2 id="swap-title">Get SORN</h2>
        <span className="muted">Uniswap v4</span>
      </div>
      {!available ? (
        <p className="notice">
          Swaps are unavailable: a vetted pool and pair token configuration are
          required.
        </p>
      ) : (
        <>
          <div className="swap-layout">
            <div>
              <div className="segmented" aria-label="Swap direction">
                <button
                  aria-pressed={direction === "buy"}
                  disabled={tx.busy}
                  onClick={() => setDirection("buy")}
                >
                  Buy SORN
                </button>
                <button
                  aria-pressed={direction === "sell"}
                  disabled={tx.busy}
                  onClick={() => setDirection("sell")}
                >
                  Sell SORN
                </button>
              </div>
              <Field
                id="swap-amount"
                label={`Pay in ${inSymbol}`}
                value={text}
                onChange={setText}
                disabled={tx.busy}
              />
              <Field
                id="slippage"
                label="Slippage tolerance (%)"
                value={slip}
                onChange={setSlip}
                disabled={tx.busy}
                hint="0.01% to 5%. Quotes expire after 60 seconds."
              />
              <WalletGate
                wallet={wallet}
                runtime={runtime}
                connectLabel="Connect to swap"
              >
                <button
                  disabled={!enabled || !value}
                  onClick={() => void getQuote()}
                >
                  {quoting
                    ? "Reading pool quote…"
                    : quote
                      ? "Refresh quote"
                      : "Get quote"}
                </button>
              </WalletGate>
              <p className="error" role="alert">
                {error}
              </p>
            </div>
            <div className="swap-review">
              <h3>Review the swap</h3>
              {quote ? (
                <>
                  <dl className="facts">
                    <div>
                      <dt>Available</dt>
                      <dd>
                        {units(quote.balance, inDecimals)} {inSymbol}
                      </dd>
                    </div>
                    <div>
                      <dt>Estimated receive</dt>
                      <dd>
                        {units(quote.out, outDecimals)} {outSymbol}
                      </dd>
                    </div>
                    <div>
                      <dt>Minimum receive</dt>
                      <dd>
                        {units(quote.minimum, outDecimals)} {outSymbol}
                      </dd>
                    </div>
                    <div>
                      <dt>Rate</dt>
                      <dd>
                        {units(
                          (quote.out * 10n ** BigInt(inDecimals)) /
                            quote.amount,
                          outDecimals,
                        )}{" "}
                        {outSymbol} / {inSymbol}
                      </dd>
                    </div>
                    <div>
                      <dt>Pool fee</dt>
                      <dd>{p!.fee / 10000}%</dd>
                    </div>
                  </dl>
                  {!fresh && (
                    <p className="notice">
                      Quote expired. Refresh before continuing.
                    </p>
                  )}
                  {quote.balance < quote.amount && (
                    <p className="notice">Insufficient {inSymbol} balance.</p>
                  )}
                  {needsToken ? (
                    <>
                      <p className="muted">
                        Step 1: approve exactly{" "}
                        {units(quote.amount, inDecimals)} {inSymbol} to Permit2.
                      </p>
                      <ActionButton
                        label={`Approve ${inSymbol} to Permit2`}
                        status={tx.states.swapTokenApprove}
                        disabled={
                          !enabled || !fresh || quote.balance < quote.amount
                        }
                        onClick={async () => {
                          if (
                            await tx.run("swapTokenApprove", "Token approval", {
                              address: input,
                              abi: sameAddress(input, t.address)
                                ? t.abi
                                : erc20Abi,
                              functionName: "approve",
                              args: [u!.permit2, quote.amount],
                            })
                          )
                            await getQuote();
                        }}
                      />
                    </>
                  ) : needsPermit ? (
                    <>
                      <p className="muted">
                        Step 2: authorize the router for this amount through
                        Permit2. Expires in one hour.
                      </p>
                      <ActionButton
                        label="Authorize router via Permit2"
                        status={tx.states.swapPermit}
                        disabled={
                          !enabled || !fresh || quote.balance < quote.amount
                        }
                        onClick={async () => {
                          if (
                            await tx.run("swapPermit", "Router authorization", {
                              address: u!.permit2,
                              abi: permit2Abi,
                              functionName: "approve",
                              args: [
                                input,
                                u!.universalRouter,
                                quote.amount,
                                Number(quote.time + 3600n),
                              ],
                            })
                          )
                            await getQuote();
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <p className="muted">
                        Swap {units(quote.amount, inDecimals)} {inSymbol} for at
                        least {units(quote.minimum, outDecimals)} {outSymbol},
                        plus network gas.
                      </p>
                      <ActionButton
                        label={`Swap ${inSymbol} for ${outSymbol}`}
                        status={tx.states.swap}
                        disabled={
                          !enabled || !fresh || quote.balance < quote.amount
                        }
                        onClick={() => void execute()}
                      />
                    </>
                  )}
                </>
              ) : (
                <p className="muted">
                  Enter an amount for a live pool quote. Buying spends{" "}
                  {pairMeta?.symbol}.
                </p>
              )}
              <Status status={tx.states.swapTokenApprove} runtime={runtime} />
              <Status status={tx.states.swapPermit} runtime={runtime} />
              <Status status={tx.states.swap} runtime={runtime} />
              <p className="muted">
                USD context unavailable. No dollar-price source is configured.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
