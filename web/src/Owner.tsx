import { useState } from "react";
import { zeroAddress } from "viem";
import { contractOf, type Runtime } from "./config";
import {
  amount,
  answerHash,
  bytesLength,
  normalizeAnswer,
  sameAddress,
  units,
} from "./domain";
import type { Transactions, Vault, Wallet } from "./session";
import { ActionButton, AddressLink, Field, Status } from "./ui";
export function Owner({
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
  const [fund, setFund] = useState("");
  const [prize, setPrize] = useState("");
  const [answer, setAnswer] = useState("");
  const [transmission, setTransmission] = useState("");
  const [hint, setHint] = useState("");
  const [confirmToken, setConfirmToken] = useState(false);
  const [confirmFund, setConfirmFund] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const d = vault.data;
  if (!d || !sameAddress(wallet.address, d.owner)) return null;
  const v = contractOf(runtime, "SorenVault"),
    t = contractOf(runtime, "LaunchToken");
  const configured = d.token !== zeroAddress,
    enabled = vault.verified && wallet.correct && !tx.busy;
  const funds = amount(fund),
    prizeAmount = amount(prize);
  const next = d.last + 1n;
  const open = d.chapters.findIndex((c) => Number(c.status) === 1) + 1;
  const canPublish =
    configured &&
    next <= 7n &&
    !open &&
    prizeAmount !== null &&
    prizeAmount <= d.available &&
    !!normalizeAnswer(answer) &&
    bytesLength(transmission) <= 2000;
  return (
    <section className="section owner" id="owner">
      <div className="section-heading">
        <h2>Owner console</h2>
        <span className="status-label">Connected owner</span>
      </div>
      <p className="muted">
        Prize funding is permanent. The owner cannot withdraw it.
      </p>
      {!wallet.correct && (
        <p className="error">
          Switch networks in the header to use owner controls.
        </p>
      )}
      <div className="owner-grid">
        <div>
          <h3>1. Lock the SORN token</h3>
          <AddressLink address={t.address} runtime={runtime} label="SORN" />
          {configured ? (
            <p className="success">Token configured and permanently locked.</p>
          ) : (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={confirmToken}
                  onChange={(e) => setConfirmToken(e.target.checked)}
                />
                Lock the attested SORN address permanently.
              </label>
              <ActionButton
                label="Set SORN token"
                status={tx.states.setToken}
                disabled={!enabled || !confirmToken}
                onClick={() =>
                  void tx.run("setToken", "Token setup", {
                    ...v,
                    functionName: "setToken",
                    args: [t.address],
                  })
                }
              />
              <Status status={tx.states.setToken} runtime={runtime} />
            </>
          )}
        </div>
        <div>
          <h3>2. Fund prizes</h3>
          <Field
            id="fund-amount"
            label="SORN to fund"
            value={fund}
            onChange={setFund}
          />
          <p className="muted">
            Available for future prizes: {units(d.available)} SORN
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmFund}
              onChange={(e) => setConfirmFund(e.target.checked)}
            />
            This deposit can never be withdrawn.
          </label>
          {funds && (d.allowance ?? 0n) < funds ? (
            <ActionButton
              label="Approve funding amount"
              status={tx.states.fundApprove}
              disabled={
                !enabled ||
                !configured ||
                !confirmFund ||
                funds > (d.balance ?? 0n)
              }
              onClick={() =>
                void tx.run("fundApprove", "Funding approval", {
                  ...t,
                  functionName: "approve",
                  args: [v.address, funds],
                })
              }
            />
          ) : (
            <ActionButton
              label="Fund vault"
              status={tx.states.fund}
              disabled={
                !enabled ||
                !configured ||
                !funds ||
                funds > (d.balance ?? 0n) ||
                !confirmFund
              }
              onClick={() =>
                void tx.run("fund", "Vault funding", {
                  ...v,
                  functionName: "fund",
                  args: [funds!],
                })
              }
            />
          )}
          <Status status={tx.states.fundApprove} runtime={runtime} />
          <Status status={tx.states.fund} runtime={runtime} />
        </div>
        <div>
          <h3>
            3. Publish chapter {next <= 7n ? next.toString() : "(complete)"}
          </h3>
          {!!open && (
            <p className="notice">Chapter {open} must be solved first.</p>
          )}
          <Field
            id="publish-answer"
            label="Correct answer (hashed locally)"
            value={answer}
            onChange={setAnswer}
          />
          {answer && (
            <details>
              <summary>Inspect normalized answer and hash</summary>
              <p className="break">{normalizeAnswer(answer)}</p>
              <code className="break">{answerHash(answer)}</code>
            </details>
          )}
          <Field
            id="prize-amount"
            label="Prize in SORN"
            value={prize}
            onChange={setPrize}
          />
          <Field
            id="transmission"
            label="Transmission"
            value={transmission}
            onChange={setTransmission}
            textarea
            hint={`${bytesLength(transmission)} / 2,000 UTF-8 bytes`}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={confirmPublish}
              onChange={(e) => setConfirmPublish(e.target.checked)}
            />
            The answer hash, prize, and transmission cannot be changed.
          </label>
          <ActionButton
            label="Publish chapter"
            status={tx.states.publish}
            disabled={!enabled || !canPublish || !confirmPublish}
            onClick={() =>
              void tx.run("publish", "Chapter publication", {
                ...v,
                functionName: "publishChapter",
                args: [next, answerHash(answer), prizeAmount!, transmission],
              })
            }
          />
          <Status status={tx.states.publish} runtime={runtime} />
        </div>
        <div>
          <h3>4. Post a hint</h3>
          <p className="muted">
            {open
              ? `For open chapter ${open}. Empty text clears its hint.`
              : "A chapter must be open."}
          </p>
          <Field
            id="hint"
            label="Hint text"
            value={hint}
            onChange={setHint}
            textarea
            hint={`${bytesLength(hint)} / 500 UTF-8 bytes`}
          />
          <ActionButton
            label={hint ? "Post hint" : "Clear hint"}
            status={tx.states.hint}
            disabled={!enabled || !open || bytesLength(hint) > 500}
            onClick={() =>
              void tx.run("hint", "Hint update", {
                ...v,
                functionName: "setHint",
                args: [BigInt(open), hint],
              })
            }
          />
          <Status status={tx.states.hint} runtime={runtime} />
        </div>
      </div>
    </section>
  );
}
