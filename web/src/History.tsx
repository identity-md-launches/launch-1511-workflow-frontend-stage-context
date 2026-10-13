import { useEffect, useRef, useState } from "react";
import { parseAbiItem, type Address } from "viem";
import { contractOf, type Runtime } from "./config";
import { readableError, units } from "./domain";
import type { Vault, Wallet } from "./session";
import { AddressLink } from "./ui";
const committed = parseAbiItem(
  "event Committed(uint256 indexed id,address indexed player,bytes32 commitHash,uint256 blockNumber,uint256 timestamp,uint256 burned)",
);
type Row = {
  address: Address;
  guesses: bigint;
  burned: bigint;
  solved: bigint;
};
export function History({
  runtime,
  vault,
  wallet,
}: {
  runtime: Runtime;
  vault: Vault;
  wallet: Wallet;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sort, setSort] = useState<"guesses" | "burned">("guesses");
  const cancel = useRef(false),
    running = useRef(false);
  useEffect(
    () => () => {
      cancel.current = true;
    },
    [],
  );
  useEffect(() => {
    if (vault.data && !start)
      setStart(
        (vault.data.block > 4999n ? vault.data.block - 4999n : 0n).toString(),
      );
  }, [vault.data, start]);
  async function scan() {
    if (!vault.data || !vault.verified || running.current) return;
    if (!/^\d+$/.test(start) || BigInt(start) > vault.data.block) {
      setMessage("Enter a start block at or before the current block.");
      return;
    }
    running.current = true;
    cancel.current = false;
    setBusy(true);
    setRows([]);
    const v = contractOf(runtime, "SorenVault"),
      end = vault.data.block,
      begin = BigInt(start);
    const addresses = new Set<Address>();
    try {
      // No fabricated entries: participants come only from contract events in the selected range.
      for (let from = begin; from <= end; from += 2000n) {
        if (cancel.current) break;
        const to = from + 1999n > end ? end : from + 1999n;
        setMessage(`Reading blocks ${from}–${to} of ${end}…`);
        const events = await vault.client.getLogs({
          address: v.address,
          event: committed,
          fromBlock: from,
          toBlock: to,
          strict: true,
        });
        events.forEach((event) => addresses.add(event.args.player));
        if (addresses.size > 500)
          throw new Error(
            "This range contains more than 500 players. Select a narrower range.",
          );
      }
      if (cancel.current) {
        setMessage("Scan stopped. Select a range and retry.");
        return;
      }
      const result: Row[] = [];
      const list = [...addresses];
      for (let i = 0; i < list.length; i += 8) {
        if (cancel.current) {
          setMessage("Scan stopped. Select a range and retry.");
          return;
        }
        result.push(
          ...(await Promise.all(
            list.slice(i, i + 8).map(async (address) => {
              const [guesses, burned, solved] =
                (await vault.client.readContract({
                  ...v,
                  functionName: "playerStats",
                  args: [address],
                  blockNumber: end,
                })) as [bigint, bigint, bigint];
              return { address, guesses, burned, solved };
            }),
          )),
        );
      }
      setRows(result);
      setMessage(
        `Scanned blocks ${begin}–${end}. ${result.length} participating wallets found. Lifetime totals as of block ${end}; wallets outside this range may be missing.`,
      );
    } catch (e) {
      setMessage(
        `Leaderboard unavailable. ${readableError(e)} Try a smaller block range.`,
      );
    } finally {
      setBusy(false);
      running.current = false;
    }
  }
  const sorted = [...rows].sort((a, b) =>
    a[sort] === b[sort]
      ? a.address.localeCompare(b.address)
      : a[sort] > b[sort]
        ? -1
        : 1,
  );
  const solved =
    vault.data?.chapters
      .map((c, i) => ({ ...c, id: i + 1 }))
      .filter((c) => Number(c.status) === 2) ?? [];
  return (
    <section className="section" id="decrypters">
      <div className="section-heading">
        <h2>Hall of Decrypters</h2>
        <span className="muted">
          {vault.data
            ? `${vault.data.solved} / 7 solved`
            : "Awaiting live state"}
        </span>
      </div>
      {solved.length ? (
        <ol className="solvers">
          {solved.map((c) => (
            <li key={c.id}>
              <span>Chapter {c.id.toString().padStart(2, "0")}</span>
              <AddressLink address={c.solver} runtime={runtime} />
              <span>
                {units(c.prize)} SORN paid ·{" "}
                {new Date(Number(c.solvedAt) * 1000).toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">
          {vault.data
            ? "No chapter has been decrypted yet. The first solver will appear here."
            : "Solvers appear after a verified vault read."}
        </p>
      )}
      {wallet.address && vault.data?.stats && (
        <dl className="personal-stats">
          <div>
            <dt>Your guesses</dt>
            <dd>{vault.data.stats[0].toString()}</dd>
          </div>
          <div>
            <dt>Your SORN burned</dt>
            <dd>{units(vault.data.stats[1])}</dd>
          </div>
          <div>
            <dt>Your chapters solved</dt>
            <dd>{vault.data.stats[2].toString()}</dd>
          </div>
        </dl>
      )}
      <details>
        <summary>Explore the guesses & burns leaderboard</summary>
        <p className="muted">
          Choose a block range to find players from public commit events. The
          default covers the latest 5,000 blocks. Use block 0 for all history;
          public RPC limits can interrupt long scans.
        </p>
        <div className="history-controls">
          <label className="field">
            Start block
            <input
              value={start}
              onChange={(e) => setStart(e.target.value)}
              inputMode="numeric"
              disabled={busy}
            />
          </label>
          <button
            disabled={busy || !vault.verified}
            onClick={() => void scan()}
          >
            Scan leaderboard
          </button>
          {busy && (
            <button
              onClick={() => {
                cancel.current = true;
              }}
            >
              Stop scan
            </button>
          )}
          <div className="field">
            <label htmlFor="leaderboard-sort">Rank by</label>
            <select
              id="leaderboard-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as "guesses" | "burned")}
            >
              <option value="guesses">Most guesses</option>
              <option value="burned">Most SORN burned</option>
            </select>
          </div>
        </div>
        <p role="status" className="muted">
          {message}
        </p>
        <ol className="leaderboard">
          {sorted.map((row) => (
            <li key={row.address}>
              <AddressLink address={row.address} runtime={runtime} />
              <span>
                {row.guesses.toString()} guesses · {units(row.burned)} SORN
                burned · {row.solved.toString()} solved
              </span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
