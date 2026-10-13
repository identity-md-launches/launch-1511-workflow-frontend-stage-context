import { useEffect, useState } from "react";
import { zeroAddress } from "viem";
import { contractOf, type Runtime } from "./config";
import {
  commitHash,
  normalizeAnswer,
  parseRecovery,
  randomSecret,
  recoveryKey,
  revealState,
  units,
  type Recovery,
} from "./domain";
import type { Transactions, Vault, Wallet } from "./session";
import { ActionButton, Field, Status, WalletGate } from "./ui";
export function Guess({
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
  const data = vault.data;
  const openIndex =
    data?.chapters.findIndex((c) => Number(c.status) === 1) ?? -1;
  const chapter = openIndex + 1;
  const v = contractOf(runtime, "SorenVault"),
    t = contractOf(runtime, "LaunchToken");
  const [answer, setAnswer] = useState("");
  const [record, setRecord] = useState<Recovery | null>(null);
  const [backup, setBackup] = useState(false);
  const [storageMessage, setStorageMessage] = useState("");
  const [restore, setRestore] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [replace, setReplace] = useState(false);
  const [now, setNow] = useState(Date.now());
  const key =
    wallet.address && chapter > 0
      ? recoveryKey(
          runtime.deployment.chainId,
          v.address,
          wallet.address,
          chapter,
        )
      : undefined;
  useEffect(() => {
    setRecord(null);
    setBackup(false);
    setReplace(false);
    setAnswer("");
    setStorageMessage("");
    setRestore("");
    setRestoreError("");
    if (!key || !wallet.address) return;
    try {
      const text = localStorage.getItem(key);
      if (text)
        setRecord(
          parseRecovery(text, {
            chainId: runtime.deployment.chainId,
            vault: v.address,
            wallet: wallet.address,
            chapter,
          }),
        );
    } catch {
      setStorageMessage(
        "Browser storage is unavailable or the saved record is damaged. Restore your backup before revealing.",
      );
    }
  }, [key, runtime.deployment.chainId, v.address, wallet.address, chapter]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const persisted = (r: Recovery) => {
    setRecord(r);
    setBackup(false);
    try {
      const previous = localStorage.getItem(key!);
      if (previous) {
        const old = JSON.parse(previous) as Recovery;
        if (old.commitHash && old.commitHash !== r.commitHash)
          localStorage.setItem(`${key}:archive:${old.commitHash}`, previous);
      }
      localStorage.setItem(key!, JSON.stringify(r));
      setStorageMessage(
        "Recovery record saved in this browser. Copy or download a private backup.",
      );
    } catch {
      setStorageMessage(
        "Browser storage failed. Copy or download your recovery record before committing. Leaving this page can lose your guess.",
      );
    }
  };
  const hasCommit = !!data?.commit && !/^0x0+$/.test(data.commit.hash);
  const matches = hasCommit && record?.commitHash === data?.commit?.hash;
  const canPlay =
    vault.verified && !!data && data.token !== zeroAddress && chapter > 0;
  const approved = (data?.allowance ?? 0n) >= (data?.cost ?? 1n);
  const enough = (data?.balance ?? 0n) >= (data?.cost ?? 1n);
  const reason = data
    ? revealState(
        data.commit,
        record,
        data.block,
        data.time,
        data.window,
        chapter > 0,
      )
    : "Read the vault first.";
  const left = data?.commit
    ? Number(data.commit.timestamp + data.window - data.time) -
      Math.max(0, Math.floor((now - data.verifiedAt) / 1000))
    : 0;
  const countdown = `${Math.floor(Math.max(0, left) / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((Math.max(0, left) % 3600) / 60)
    .toString()
    .padStart(
      2,
      "0",
    )}:${Math.max(0, left) % 60 < 10 ? "0" : ""}${Math.max(0, left) % 60}`;
  function prepare() {
    if (!wallet.address || !key || !normalizeAnswer(answer)) return;
    const normalized = normalizeAnswer(answer),
      secret = randomSecret();
    persisted({
      version: 1,
      chainId: runtime.deployment.chainId,
      vault: v.address,
      wallet: wallet.address,
      chapter,
      answer: normalized,
      secret,
      commitHash: commitHash(normalized, wallet.address, secret),
    });
  }
  const recordText = record ? JSON.stringify(record, null, 2) : "";
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([recordText], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `soren-chapter-${chapter}-recovery.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="guess" aria-labelledby="guess-title">
      <div className="section-heading">
        <h2 id="guess-title">
          {matches && !replace ? "Reveal your answer" : "Commit your answer"}
        </h2>
        <span className="step">
          {matches && !replace ? "02 / 02" : "01 / 02"}
        </span>
      </div>
      {!data ? (
        <p className="muted">
          {vault.error
            ? "Vault state unavailable. Retry the live read."
            : "Reading the vault…"}
        </p>
      ) : data.token === zeroAddress ? (
        <p className="muted">
          Awaiting owner setup. SORN must be locked into the vault settings
          before play begins.
        </p>
      ) : chapter === 0 ? (
        <p className="muted">
          {data.solved === 7n
            ? "All seven chapters are decrypted."
            : "Awaiting the next transmission from the vault owner."}
        </p>
      ) : (
        <p className="compact">
          Chapter {chapter.toString().padStart(2, "0")} ·{" "}
          {units(data.chapters[openIndex].prize)} SORN prize
        </p>
      )}
      {matches && !replace ? (
        <>
          <p className="timer">
            {countdown} <small>estimated time left</small>
          </p>
          <p className="muted">
            Reveal after block {data?.commit?.block.toString()}. The chain clock
            decides expiry.
          </p>
          <p className="muted">
            Your committed answer:{" "}
            <code className="break">{record?.answer}</code>
          </p>
          {reason && <p className="notice">{reason}</p>}
          <WalletGate wallet={wallet} runtime={runtime}>
            <ActionButton
              primary
              label="Reveal answer"
              disabled={!canPlay || !!reason || tx.busy}
              status={tx.states.reveal}
              onClick={() =>
                void tx.run("reveal", "Reveal", {
                  ...v,
                  functionName: "reveal",
                  args: [BigInt(chapter), record!.answer, record!.secret],
                })
              }
            />
          </WalletGate>
        </>
      ) : (
        <>
          <Field
            id="guess-answer"
            label="Your answer"
            value={answer}
            onChange={(value) => {
              setAnswer(value);
              if (record && !matches) {
                setRecord(null);
                setBackup(false);
              }
            }}
            disabled={!canPlay || tx.busy}
            hint="Lowercase. Whitespace removed."
          />
          <p className="cost">
            {data ? units(data.cost) : "100"} SORN burned per commit + network
            gas.
          </p>
          <WalletGate wallet={wallet} runtime={runtime}>
            {!record || matches ? (
              <button
                className="primary"
                disabled={
                  !canPlay ||
                  !normalizeAnswer(answer) ||
                  tx.busy ||
                  (hasCommit && !replace)
                }
                onClick={prepare}
              >
                Prepare private guess
              </button>
            ) : (
              <>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={backup}
                    onChange={(e) => setBackup(e.target.checked)}
                  />
                  I saved a recovery backup and understand this burns{" "}
                  {units(data?.cost)} SORN with no refund.
                </label>
                {!enough && (
                  <p className="notice">
                    You need {units(data?.cost)} SORN.{" "}
                    <a href="#swap">Get SORN</a> to continue.
                  </p>
                )}
                {!approved ? (
                  <ActionButton
                    primary
                    label={`Approve ${units(data?.cost)} SORN`}
                    disabled={!canPlay || !enough || !backup || tx.busy}
                    status={tx.states.guessApprove}
                    onClick={() =>
                      void tx.run("guessApprove", "Guess approval", {
                        ...t,
                        functionName: "approve",
                        args: [v.address, data!.cost],
                      })
                    }
                  />
                ) : (
                  <ActionButton
                    primary
                    label={`Commit & burn ${units(data?.cost)} SORN`}
                    disabled={!canPlay || !enough || !backup || tx.busy}
                    status={tx.states.commit}
                    onClick={async () => {
                      if (
                        await tx.run("commit", "Commit", {
                          ...v,
                          functionName: "commit",
                          args: [BigInt(chapter), record.commitHash],
                        })
                      ) {
                        setReplace(false);
                      }
                    }}
                  />
                )}
              </>
            )}
          </WalletGate>
        </>
      )}
      <Status status={tx.states.guessApprove} runtime={runtime} />
      <Status status={tx.states.commit} runtime={runtime} />
      <Status status={tx.states.reveal} runtime={runtime} />
      {hasCommit && !matches && (
        <button
          disabled={tx.busy}
          onClick={() => {
            try {
              const text = localStorage.getItem(
                `${key}:archive:${data!.commit!.hash}`,
              );
              if (!text)
                throw new Error(
                  "No matching record in this browser. Restore your private JSON backup.",
                );
              persisted(
                parseRecovery(text, {
                  chainId: runtime.deployment.chainId,
                  vault: v.address,
                  wallet: wallet.address!,
                  chapter,
                }),
              );
              setReplace(false);
              setRestoreError("");
            } catch (e) {
              setRestoreError((e as Error).message);
            }
          }}
        >
          Restore current onchain guess
        </button>
      )}
      {hasCommit && (
        <label className="check replacement">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => {
              setReplace(e.target.checked);
              setAnswer("");
            }}
            disabled={tx.busy}
          />
          Replace this commitment with a new paid guess. This burns another{" "}
          {units(data?.cost)} SORN.
        </label>
      )}
      {record && (
        <div className="recovery">
          <p className="notice" role="status">
            {storageMessage ||
              "Saved recovery record loaded. Keep a private backup until this guess is settled."}
          </p>
          <div className="button-row">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(recordText);
                  setStorageMessage(
                    "Recovery record copied. Store it privately before committing.",
                  );
                } catch {
                  setStorageMessage(
                    "Clipboard failed. Download the record or copy it from the details below.",
                  );
                }
              }}
            >
              Copy recovery
            </button>
            <button onClick={download}>Download backup</button>
          </div>
          <details>
            <summary>View private recovery record</summary>
            <textarea
              aria-label="Recovery record"
              value={recordText}
              readOnly
              rows={7}
            />
            <p className="muted">
              Contains your answer and secret. Keep it private until reveal.
            </p>
          </details>
        </div>
      )}
      {wallet.address && chapter > 0 && (
        <details className="restore">
          <summary>Restore a saved guess</summary>
          <Field
            id="restore-record"
            label="Recovery JSON"
            value={restore}
            onChange={setRestore}
            textarea
          />
          <button
            disabled={!restore || tx.busy}
            onClick={() => {
              try {
                persisted(
                  parseRecovery(restore, {
                    chainId: runtime.deployment.chainId,
                    vault: v.address,
                    wallet: wallet.address!,
                    chapter,
                  }),
                );
                setRestoreError("");
                setReplace(false);
              } catch (e) {
                setRestoreError((e as Error).message);
              }
            }}
          >
            Restore recovery
          </button>
        </details>
      )}
      {restoreError && (
        <p className="error" role="alert">
          {restoreError}
        </p>
      )}
      <details className="rules">
        <summary>How commit & reveal works</summary>
        <ol>
          <li>Prepare an answer and save its secret.</li>
          <li>
            Approve SORN, then commit. Each commit irreversibly burns 100 SORN,
            even if you lose.
          </li>
          <li>
            Wait at least one block, then reveal within 24 hours. Only the first
            correct reveal wins.
          </li>
        </ol>
        <p>
          Revealing publishes your answer and secret. A rejected, wrong,
          expired, or late guess is not refunded.
        </p>
      </details>
    </section>
  );
}
