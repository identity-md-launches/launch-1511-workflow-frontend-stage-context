import { useState, type ReactNode } from "react";
import { getAddress, type Address } from "viem";
import type { Runtime } from "./config";
import type { ActionStatus, Wallet } from "./session";
export function AddressLink({
  address,
  runtime,
  label,
}: {
  address: Address;
  runtime: Runtime;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const full = getAddress(address);
  return (
    <span className="address-block">
      <a
        href={`${runtime.deployment.network.explorer}/address/${full}`}
        target="_blank"
        rel="noreferrer"
      >
        {label && <span>{label} </span>}
        <bdi>{full}</bdi>
        <span className="sr-only"> (opens explorer)</span>
      </a>
      <button
        className="copy"
        aria-label={`Copy ${label ?? "address"}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(full);
            setCopied(true);
            setError("");
          } catch {
            setError("Clipboard unavailable. Select and copy the address.");
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {error && <span role="status">{error}</span>}
    </span>
  );
}
export function Status({
  status,
  runtime,
}: {
  status?: ActionStatus;
  runtime: Runtime;
}) {
  return (
    <div
      className={`action-status ${status?.phase === "error" ? "error" : ""}`}
      role={status?.phase === "error" ? "alert" : "status"}
    >
      {status?.message}
      {status?.hash && (
        <>
          {" "}
          <a
            href={`${runtime.deployment.network.explorer}/tx/${status.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction
          </a>
        </>
      )}
    </div>
  );
}
export function ActionButton({
  label,
  status,
  disabled,
  onClick,
  primary = false,
}: {
  label: string;
  status?: ActionStatus;
  disabled?: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  const pending =
    status && ["simulating", "signing", "confirming"].includes(status.phase);
  return (
    <button
      className={primary ? "primary" : ""}
      disabled={disabled || !!pending}
      onClick={onClick}
      aria-busy={!!pending}
    >
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" />
          {status.phase === "confirming"
            ? "Waiting for confirmation…"
            : status.phase === "simulating"
              ? "Checking transaction…"
              : "Confirm in wallet…"}
        </>
      ) : (
        label
      )}
    </button>
  );
}
export function WalletGate({
  wallet,
  runtime,
  children,
  connectLabel = "Connect to play",
}: {
  wallet: Wallet;
  runtime: Runtime;
  children: ReactNode;
  connectLabel?: string;
}) {
  if (!wallet.address)
    return (
      <button
        className="primary"
        disabled={wallet.busy}
        onClick={() => void wallet.connect()}
      >
        {wallet.busy ? "Connecting…" : connectLabel}
      </button>
    );
  if (!wallet.correct)
    return (
      <p className="error">
        Wrong network. Use “Switch to {runtime.deployment.network.name}” in the
        header.
      </p>
    );
  return children;
}
export function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
  disabled = false,
  textarea = false,
  id,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
  hint?: string;
  disabled?: boolean;
  textarea?: boolean;
  id: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {textarea ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={4}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
      ) : (
        <input
          id={id}
          type={type}
          inputMode={type === "text" ? undefined : "decimal"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
