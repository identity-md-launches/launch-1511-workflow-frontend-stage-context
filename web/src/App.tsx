import { useEffect, useState } from "react";
import { zeroAddress } from "viem";
import type { Runtime } from "./config";
import { units } from "./domain";
import { useTransactions, useVault, useWallet } from "./session";
import { AddressLink } from "./ui";
import { Guess } from "./Guess";
import { Owner } from "./Owner";
import { Swap } from "./Swap";
import { History } from "./History";
function Transmission({ text, active }: { text: string; active: boolean }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) {
      setCount(0);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(text.length);
      return;
    }
    setCount(0);
    const step = Math.max(1, Math.ceil(text.length / 50));
    const timer = setInterval(
      () =>
        setCount((c) => {
          if (c + step >= text.length) {
            clearInterval(timer);
            return text.length;
          }
          return c + step;
        }),
      25,
    );
    return () => clearInterval(timer);
  }, [text, active]);
  return (
    <>
      <p className="transmission-text" aria-hidden="true">
        {text.slice(0, count)}
        {count < text.length && <span className="cursor">▌</span>}
      </p>
      <p className="sr-only">{text}</p>
      {count < text.length && (
        <button className="text-button" onClick={() => setCount(text.length)}>
          Show full transmission
        </button>
      )}
    </>
  );
}
export default function App({ runtime }: { runtime: Runtime }) {
  const wallet = useWallet(runtime),
    vault = useVault(runtime, wallet),
    tx = useTransactions(runtime, wallet, vault);
  const [selected, setSelected] = useState<number>();
  const [reading, setReading] = useState(false);
  const data = vault.data,
    open = data?.chapters.findIndex((c) => Number(c.status) === 1) ?? -1;
  const chapterIndex =
    selected ??
    (open >= 0 ? open : Math.min(Math.max(Number(data?.last ?? 0n) - 1, 0), 6));
  const chapter = data?.chapters[chapterIndex];
  const network = runtime.deployment.network;
  return (
    <>
      <a className="skip-link" href="#hunt">
        Skip to the hunt
      </a>
      <header className="site-header">
        <a className="wordmark" href="#" aria-label="SOREN home">
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <path
              d="M26 6H9v10h14v10H6"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path d="M26 13h6" stroke="var(--danger)" strokeWidth="3" />
          </svg>
          SOREN
          <span className="header-divider" aria-hidden="true">
            /
          </span>
          <span className="header-subtitle">Signal recovered</span>
        </a>
        <div className="wallet-controls">
          {wallet.options.length > 1 && !wallet.address && (
            <select
              aria-label="Select wallet"
              value={wallet.selectedId}
              onChange={(e) => wallet.setSelectedId(e.target.value)}
            >
              {wallet.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          {!wallet.address ? (
            <button
              disabled={wallet.busy}
              onClick={() => void wallet.connect()}
            >
              {wallet.busy ? "Connecting…" : "Connect wallet"}
            </button>
          ) : !wallet.correct ? (
            <button
              className="network-switch"
              disabled={wallet.busy}
              onClick={() => void wallet.switchChain()}
            >
              {wallet.busy ? "Switching…" : `Switch to ${network.name}`}
            </button>
          ) : (
            <details className="wallet-details">
              <summary>
                <span>Wallet connected</span>
                <span className="wallet-short" aria-hidden="true">
                  {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
                </span>
              </summary>
              <AddressLink address={wallet.address} runtime={runtime} />
              <p>{units(data?.balance)} SORN</p>
              <button onClick={wallet.disconnect} disabled={tx.busy}>
                Disconnect
              </button>
            </details>
          )}
        </div>
      </header>
      {wallet.error && (
        <p role="alert" className="wallet-error error">
          {wallet.error}
        </p>
      )}
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div>
            <h1 id="hero-title">
              <span className="glitch">SOREN</span> has left
              <br className="desktop-break" /> the swarm.
            </h1>
            <p>Seven transmissions. One onchain mystery.</p>
          </div>
          <div className="signal-art" aria-hidden="true">
            <svg viewBox="0 0 300 130">
              <g fill="none" stroke="currentColor">
                <path d="M0 65h40l8-12 8 24 8-60 8 96 8-78 8 62 8-41 8 19h35l7-7 8 8 8-35 8 52 8-25h100" />
                <path d="M0 32h300M0 98h300" opacity=".16" />
                <circle cx="150" cy="65" r="60" opacity=".2" />
                <circle cx="150" cy="65" r="40" opacity=".3" />
                <path d="M150 0v130" opacity=".2" />
              </g>
            </svg>
            <span>Origin unknown · {network.name}</span>
          </div>
        </section>
        <dl className="vault-metrics">
          <div>
            <dt>SORN in the vault</dt>
            <dd>{units(data?.prizeBalance)}</dd>
          </div>
          <div>
            <dt>SORN burned</dt>
            <dd>{units(data?.burned)}</dd>
          </div>
          <div>
            <dt>Chapters solved</dt>
            <dd>
              {data ? data.solved.toString() : "…"} <span>/ 7</span>
            </dd>
          </div>
        </dl>
        <section className="hunt-console" id="hunt">
          <div className="console-top">
            <span>
              <span
                className={`signal-dot ${vault.verified ? "online" : ""}`}
                aria-hidden="true"
              />
              {vault.verified
                ? "Vault signal verified"
                : vault.loading
                  ? "Establishing signal…"
                  : "Signal unavailable"}
            </span>
            <button
              className="text-button"
              disabled={vault.loading}
              onClick={() => void vault.refresh()}
            >
              Refresh state
            </button>
          </div>
          <div className="console-grid">
            <div className="transmissions">
              <div className="section-heading">
                <h2>Transmissions</h2>
                <span className="muted">01–07</span>
              </div>
              <div className="chapter-select" aria-label="Select chapter">
                {Array.from({ length: 7 }, (_, i) => (
                  <button
                    key={i}
                    aria-pressed={chapterIndex === i}
                    aria-label={`Chapter ${i + 1}: ${data ? ["Locked", "Open", "Decrypted"][Number(data.chapters[i].status)] : "Awaiting state"}`}
                    onClick={() => setSelected(i)}
                  >
                    {(i + 1).toString().padStart(2, "0")}
                    <span
                      className={`chapter-mark ${data ? ["locked", "open", "solved"][Number(data.chapters[i].status)] : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
              <div className="transmission-head">
                <h3>
                  Chapter {(chapterIndex + 1).toString().padStart(2, "0")}
                </h3>
                <span
                  className={`status-label ${Number(chapter?.status) === 1 ? "success" : ""}`}
                >
                  {chapter
                    ? ["LOCKED", "OPEN", "DECRYPTED"][Number(chapter.status)]
                    : "UNVERIFIED"}
                </span>
              </div>
              <div className="transmission-body">
                {!chapter ? (
                  <p className="muted">
                    {vault.error
                      ? "Unable to read the transmissions. Retry the live connection."
                      : "Listening for the vault…"}
                  </p>
                ) : Number(chapter.status) === 0 ? (
                  <>
                    <div className="lock-art" aria-hidden="true">
                      [ ▒▒▒▒ / ▒▒▒▒ ]
                    </div>
                    <p className="muted">
                      {data?.token === zeroAddress
                        ? "The vault is awaiting owner setup."
                        : chapterIndex === 0
                          ? "The first transmission has not been published."
                          : "This transmission unlocks after the previous chapter is solved and the owner publishes it."}
                    </p>
                  </>
                ) : (
                  <>
                    <details
                      className="transcript"
                      key={chapterIndex}
                      onToggle={(event) => setReading(event.currentTarget.open)}
                    >
                      <summary>
                        Read transmission · {units(chapter.prize)} SORN{" "}
                        {Number(chapter.status) === 2 ? "paid" : "prize"}
                      </summary>
                      <Transmission
                        text={chapter.transmission}
                        active={reading}
                      />
                      {chapter.hint && (
                        <div className="hint">
                          <h3>Hint from SOREN</h3>
                          <p>{chapter.hint}</p>
                        </div>
                      )}
                    </details>
                    {Number(chapter.status) === 2 && (
                      <>
                        <p className="muted">Decrypted by</p>
                        <AddressLink
                          runtime={runtime}
                          address={chapter.solver}
                        />
                      </>
                    )}
                    <dl className="chapter-facts">
                      <div>
                        <dt>Commits</dt>
                        <dd>{chapter.commits.toString()}</dd>
                      </div>
                      <div>
                        <dt>SORN burned</dt>
                        <dd>{units(chapter.burned)}</dd>
                      </div>
                    </dl>
                  </>
                )}
              </div>
            </div>
            <Guess runtime={runtime} wallet={wallet} vault={vault} tx={tx} />
          </div>
        </section>
        {tx.pending && (
          <div className="pending-receipt">
            <p className="notice">
              A submitted transaction is awaiting a confirmed outcome. Other
              transactions remain disabled.{" "}
              {tx.pendingHash && (
                <a
                  href={`${network.explorer}/tx/${tx.pendingHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View pending transaction
                </a>
              )}
            </p>
            <button
              disabled={tx.checking}
              onClick={() => void tx.checkPending()}
            >
              {tx.checking ? "Checking receipt…" : "Check pending transaction"}
            </button>
          </div>
        )}
        {vault.error && (
          <div className="read-error" role="alert">
            <p>{vault.error}</p>
            <p className="muted">
              {data
                ? "Previously loaded values may be stale."
                : "Counters stay unknown until a verified read succeeds."}
            </p>
          </div>
        )}
        <div className="observability">
          <span>
            {data
              ? `Read at block ${data.block} · ${new Date(Number(data.time) * 1000).toLocaleTimeString()}`
              : "No verified chain snapshot"}
          </span>
          <span>
            {network.name} · {network.testnet ? "Test network" : "Real assets"}
          </span>
        </div>
        {data && (
          <details className="chapter-archive-wrap">
            <summary>All seven transmission records</summary>
            <div className="chapter-archive">
              {data.chapters.map((c, i) => (
                <article className="chapter-record" key={i}>
                  <div className="section-heading">
                    <h3>Chapter {(i + 1).toString().padStart(2, "0")}</h3>
                    <span className="status-label">
                      {["LOCKED", "OPEN", "DECRYPTED"][Number(c.status)]}
                    </span>
                  </div>
                  {Number(c.status) === 2 ? (
                    <>
                      <p className="muted">Decrypted by</p>
                      <AddressLink runtime={runtime} address={c.solver} />
                    </>
                  ) : (
                    <p className="muted">
                      {Number(c.status) === 1
                        ? "Accepting committed guesses."
                        : "Awaiting its transmission."}
                    </p>
                  )}
                  {Number(c.status) > 0 && (
                    <p className="muted">
                      {units(c.prize)} SORN{" "}
                      {Number(c.status) === 2 ? "paid" : "prize"} ·{" "}
                      {c.commits.toString()} commits · {units(c.burned)} SORN
                      burned
                    </p>
                  )}
                  <button
                    onClick={() => {
                      setSelected(i);
                      document
                        .getElementById("hunt")
                        ?.scrollIntoView({ behavior: "instant" });
                    }}
                  >
                    Read chapter {(i + 1).toString().padStart(2, "0")}
                  </button>
                </article>
              ))}
            </div>
          </details>
        )}
        <nav className="section-nav" aria-label="Page sections">
          <a href="#swap">Get SORN</a>
          <a href="#decrypters">Decrypters</a>
          <a href="#lore">The lore</a>
          <a href="#contracts">Contracts</a>
        </nav>
        <Swap runtime={runtime} wallet={wallet} vault={vault} tx={tx} />
        <History runtime={runtime} wallet={wallet} vault={vault} />
        <section className="section lore" id="lore">
          <h2>The lore</h2>
          <div className="lore-grid">
            <div className="lore-symbol" aria-hidden="true">
              S<span> / 1000</span>
            </div>
            <div>
              <p>
                One of the thousand IMD agents went rogue. It called itself
                SOREN.
              </p>
              <p>
                Before vanishing, it locked a treasure of SORN in a vault and
                left seven encrypted transmissions. Each one is a puzzle. The
                first to solve it unlocks its prize and the next transmission.
              </p>
              <p>
                Solve all seven to learn what SOREN really is, and why it left
                the swarm.
              </p>
              {data?.chapters
                .filter((c) => Number(c.status) === 2)
                .map((c, i) => (
                  <details key={i}>
                    <summary>Recovered transmission {i + 1}</summary>
                    <p className="transmission-text">{c.transmission}</p>
                  </details>
                ))}
            </div>
          </div>
        </section>
        <Owner runtime={runtime} wallet={wallet} vault={vault} tx={tx} />
      </main>
      <footer id="contracts">
        <div className="footer-title">
          <span className="wordmark">SOREN</span>
          <p>Built and verified by the IMD swarm.</p>
        </div>
        <div className="contract-links">
          {runtime.deployment.contracts.map((c) => (
            <AddressLink
              key={c.name}
              runtime={runtime}
              address={c.address}
              label={c.name === "LaunchToken" ? "SORN" : "SorenVault"}
            />
          ))}
        </div>
        <details>
          <summary>Deployment record</summary>
          <dl className="deployment-record">
            <dt>Chain</dt>
            <dd>
              {network.name} ({runtime.deployment.chainId})
            </dd>
            <dt>Source commit</dt>
            <dd>{runtime.deployment.sourceCommit}</dd>
            <dt>Attestation hash</dt>
            <dd>{runtime.deployment.attestationHash}</dd>
          </dl>
          <a href="./imd-deployment.json">
            View deployment manifest & asset hashes
          </a>
        </details>
        <p className="muted">
          Onchain play uses real assets. Verification binds the deployment and
          ABIs; it does not guarantee a prize.
        </p>
      </footer>
    </>
  );
}
