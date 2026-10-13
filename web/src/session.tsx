import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  getAddress,
  zeroAddress,
  type Address,
  type EIP1193Provider,
  type Hex,
  type Abi,
} from "viem";
import { contractOf, publicClient, type Runtime } from "./config";
import { readableError, sameAddress } from "./domain";
export type Provider = EIP1193Provider & {
  on?: (event: string, fn: (data: unknown) => void) => void;
  removeListener?: (event: string, fn: (data: unknown) => void) => void;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
type WalletOption = { id: string; name: string; provider: Provider };
export function useWallet(runtime: Runtime) {
  const [options, setOptions] = useState<WalletOption[]>([]);
  const [provider, setProvider] = useState<Provider>();
  const [selectedId, setSelectedId] = useState("");
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  const connectionLock = useRef(false);
  useEffect(() => {
    const announce = (event: Event) => {
      const { info, provider: p } = (
        event as CustomEvent<{
          info: { uuid: string; name: string };
          provider: Provider;
        }>
      ).detail;
      if (!info?.uuid || !p?.request) return;
      setOptions((old) =>
        old.some((o) => o.id === info.uuid)
          ? old
          : [...old, { id: info.uuid, name: info.name, provider: p }],
      );
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    if (window.ethereum)
      setOptions((old) =>
        old.length
          ? old
          : [
              {
                id: "injected",
                name: "Browser wallet",
                provider: window.ethereum!,
              },
            ],
      );
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  useEffect(() => {
    if (options.length && !options.some((o) => o.id === selectedId))
      setSelectedId(options[0].id);
  }, [options, selectedId]);
  useEffect(() => {
    if (!provider) return;
    const accounts = (value: unknown) => {
      epoch.current++;
      setAddress((value as Address[])[0]);
    };
    const chain = (value: unknown) => {
      epoch.current++;
      setChainId(Number(value));
    };
    const disconnected = () => {
      epoch.current++;
      setAddress(undefined);
      setChainId(undefined);
    };
    provider.on?.("accountsChanged", accounts);
    provider.on?.("chainChanged", chain);
    provider.on?.("disconnect", disconnected);
    return () => {
      provider.removeListener?.("accountsChanged", accounts);
      provider.removeListener?.("chainChanged", chain);
      provider.removeListener?.("disconnect", disconnected);
    };
  }, [provider]);
  async function connect(id: string = selectedId) {
    if (connectionLock.current) return;
    const p =
      options.find((o) => o.id === id)?.provider ?? options[0]?.provider;
    if (!p) {
      setError(
        "No browser wallet found. Open this site in a wallet browser or install an Ethereum wallet.",
      );
      return;
    }
    connectionLock.current = true;
    setBusy(true);
    setError("");
    try {
      const accounts = await p.request({ method: "eth_requestAccounts" });
      const chain = await p.request({ method: "eth_chainId" });
      epoch.current++;
      setProvider(p);
      setAddress(accounts[0] ? getAddress(accounts[0]) : undefined);
      setChainId(Number(chain));
    } catch (e) {
      setError(readableError(e));
    } finally {
      connectionLock.current = false;
      setBusy(false);
    }
  }
  async function switchChain() {
    if (!provider || connectionLock.current) return;
    connectionLock.current = true;
    setBusy(true);
    setError("");
    const params = [
      { chainId: `0x${runtime.deployment.chainId.toString(16)}` },
    ] as [{ chainId: Hex }];
    try {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params,
        });
      } catch (e) {
        const err = e as {
          code?: number;
          message?: string;
          data?: { originalError?: { code?: number } };
        };
        if (
          !(
            err.code === 4902 ||
            err.data?.originalError?.code === 4902 ||
            /unknown chain|unrecognized chain|not added/i.test(
              err.message ?? "",
            )
          ) ||
          !runtime.deployment.walletAddChain
        )
          throw e;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            runtime.deployment.walletAddChain as {
              chainId: Hex;
              chainName: string;
              rpcUrls: string[];
              nativeCurrency: {
                name: string;
                symbol: string;
                decimals: number;
              };
              blockExplorerUrls: string[];
            },
          ],
        });
        await provider.request({
          method: "wallet_switchEthereumChain",
          params,
        });
      }
      epoch.current++;
      setChainId(Number(await provider.request({ method: "eth_chainId" })));
    } catch (e) {
      setError(readableError(e));
    } finally {
      connectionLock.current = false;
      setBusy(false);
    }
  }
  function disconnect() {
    epoch.current++;
    setAddress(undefined);
    setProvider(undefined);
    setChainId(undefined);
    setError("");
  }
  const correct = chainId === runtime.deployment.chainId;
  return {
    options,
    selectedId,
    setSelectedId,
    provider,
    address,
    chainId,
    busy,
    error,
    connect,
    switchChain,
    disconnect,
    correct,
    epoch,
  };
}
export type Wallet = ReturnType<typeof useWallet>;
export type Chapter = {
  status: number;
  solver: Address;
  solvedAt: bigint;
  prize: bigint;
  commits: bigint;
  burned: bigint;
  answerHash: Hex;
  transmission: string;
  hint: string;
};
export type Snapshot = {
  chapters: Chapter[];
  owner: Address;
  token: Address;
  prizeBalance: bigint;
  available: bigint;
  burned: bigint;
  solved: bigint;
  last: bigint;
  cost: bigint;
  window: bigint;
  block: bigint;
  time: bigint;
  balance?: bigint;
  allowance?: bigint;
  stats?: readonly [bigint, bigint, bigint];
  commit?: { chapter: number; hash: Hex; block: bigint; timestamp: bigint };
  decimals: number;
  symbol: string;
  verifiedAt: number;
};
export function useVault(runtime: Runtime, wallet: Wallet) {
  const client = useMemo(
    () => publicClient(runtime, wallet.correct ? wallet.provider : undefined),
    [runtime, wallet.provider, wallet.correct],
  );
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const active = useRef<Promise<void> | null>(null);
  const generation = useRef(0);
  const read = useCallback(
    async (minBlock?: bigint) => {
      const gen = generation.current;
      while (active.current) await active.current;
      if (gen !== generation.current) return;
      setLoading(true);
      let release: () => void = () => {};
      active.current = new Promise<void>((resolve) => {
        release = resolve;
      });
      const epoch = wallet.epoch.current;
      try {
        const v = contractOf(runtime, "SorenVault"),
          t = contractOf(runtime, "LaunchToken");
        const [chain, block, ...code] = await Promise.all([
          client.getChainId(),
          client.getBlock(),
          ...runtime.deployment.contracts.map((c) =>
            client.getCode({ address: c.address }),
          ),
        ]);
        if (minBlock !== undefined && block.number < minBlock)
          throw new Error(
            "RPC is behind your confirmed transaction. Refresh state before continuing.",
          );
        if (
          chain !== runtime.deployment.chainId ||
          code.some((c) => !c || c === "0x")
        )
          throw new Error(
            "Deployment could not be verified on this RPC. Transactions are disabled. Retry a fresh read.",
          );
        const vr = (functionName: string, args: readonly unknown[] = []) =>
          client.readContract({
            ...v,
            functionName,
            args,
            blockNumber: block.number,
          });
        const tr = (functionName: string, args: readonly unknown[] = []) =>
          client.readContract({
            ...t,
            functionName,
            args,
            blockNumber: block.number,
          });
        const [
          chapters,
          owner,
          token,
          burned,
          solved,
          last,
          cost,
          window,
          decimals,
          symbol,
        ] = (await Promise.all([
          vr("getAllChapters"),
          vr("owner"),
          vr("token"),
          vr("totalBurned"),
          vr("chaptersSolved"),
          vr("lastPublishedChapter"),
          vr("COMMIT_COST"),
          vr("REVEAL_WINDOW"),
          tr("decimals"),
          tr("symbol"),
        ])) as [
          Chapter[],
          Address,
          Address,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          number,
          string,
        ];
        if (decimals !== 18 || symbol !== "SORN")
          throw new Error(
            "The deployed token does not match SORN. Transactions are disabled.",
          );
        if (token !== zeroAddress && !sameAddress(token, t.address))
          throw new Error(
            "The vault token differs from the attested SORN address. Transactions are disabled.",
          );
        let prizeBalance = 0n,
          available = 0n;
        if (token !== zeroAddress)
          [prizeBalance, available] = (await Promise.all([
            vr("prizeBalance"),
            vr("availablePrizes"),
          ])) as [bigint, bigint];
        let balance: bigint | undefined,
          allowance: bigint | undefined,
          stats: Snapshot["stats"],
          commit: Snapshot["commit"];
        if (wallet.address) {
          [balance, allowance, stats] = (await Promise.all([
            tr("balanceOf", [wallet.address]),
            tr("allowance", [wallet.address, v.address]),
            vr("playerStats", [wallet.address]),
          ])) as [bigint, bigint, readonly [bigint, bigint, bigint]];
          const i = chapters.findIndex((c) => Number(c.status) === 1);
          if (i >= 0) {
            const [hash, b, timestamp] = (await vr("commitments", [
              BigInt(i + 1),
              wallet.address,
            ])) as [Hex, bigint, bigint];
            commit = { chapter: i + 1, hash, block: b, timestamp };
          }
        }
        if (gen !== generation.current || epoch !== wallet.epoch.current)
          return;
        setData({
          chapters,
          owner,
          token,
          prizeBalance,
          available,
          burned,
          solved,
          last,
          cost,
          window,
          decimals,
          symbol,
          block: block.number,
          time: block.timestamp,
          balance,
          allowance,
          stats,
          commit,
          verifiedAt: Date.now(),
        });
        setVerified(true);
        setError("");
      } catch (e) {
        if (gen === generation.current) {
          setVerified(false);
          setError(readableError(e));
        }
      } finally {
        active.current = null;
        release();
        if (gen === generation.current) setLoading(false);
      }
    },
    [client, runtime, wallet.address, wallet.epoch],
  );
  useEffect(() => {
    generation.current++;
    setData(undefined);
    setVerified(false);
    setLoading(true);
    void read();
    const timer = setInterval(() => {
      if (!document.hidden) void read();
    }, 12000);
    const visible = () => {
      if (!document.hidden) void read();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      generation.current++;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [read]);
  return { client, data, error, loading, verified, refresh: read };
}
export type Vault = ReturnType<typeof useVault>;
export type ActionStatus = {
  phase: "simulating" | "signing" | "confirming" | "success" | "error";
  message: string;
  hash?: Hex;
};
export type ContractCall = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};
type PendingTx = {
  hash: Hex;
  address: Address;
  data: Hex;
  value: string;
  account: Address;
  key: string;
  label: string;
};
export function useTransactions(
  runtime: Runtime,
  wallet: Wallet,
  vault: Vault,
) {
  const [states, setStates] = useState<Record<string, ActionStatus>>({});
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingTx | null>(null);
  const pendingRef = useRef<PendingTx | null>(null);
  const [checking, setChecking] = useState(false);
  const pendingKey = (account: Address) =>
    `soren:pending:${runtime.deployment.chainId}:${contractOf(runtime, "SorenVault").address.toLowerCase()}:${account.toLowerCase()}`;
  const update = (key: string, status: ActionStatus) =>
    setStates((s) => ({ ...s, [key]: status }));
  const remember = (p: PendingTx) => {
    pendingRef.current = p;
    setPending(p);
    try {
      localStorage.setItem(pendingKey(p.account), JSON.stringify(p));
    } catch {
      /* The visible transaction hash remains recoverable from the wallet. */
    }
  };
  const forget = (p: PendingTx) => {
    try {
      localStorage.removeItem(pendingKey(p.account));
    } catch {
      /* A stale saved receipt is harmless and will be rechecked. */
    }
    pendingRef.current = null;
    setPending(null);
  };
  useEffect(() => {
    if (!wallet.address || lock.current || pendingRef.current) return;
    try {
      const raw = localStorage.getItem(pendingKey(wallet.address));
      if (!raw) return;
      const saved = JSON.parse(raw) as PendingTx;
      if (
        !/^0x[0-9a-f]{64}$/i.test(saved.hash) ||
        !sameAddress(saved.account, wallet.address) ||
        !/^0x[0-9a-f]*$/i.test(saved.data)
      )
        return;
      pendingRef.current = saved;
      setPending(saved);
      update(saved.key, {
        phase: "confirming",
        hash: saved.hash,
        message: `${saved.label} was submitted earlier. Check its receipt before another transaction.`,
      });
    } catch {
      /* Recovery and receipts remain available through the user's backup/wallet. */
    }
  }, [wallet.address, runtime, pending]);
  const validateMined = async (p: PendingTx) => {
    const mined = await vault.client.getTransaction({ hash: p.hash });
    return (
      mined.input === p.data &&
      sameAddress(mined.to ?? undefined, p.address) &&
      sameAddress(mined.from, p.account) &&
      mined.value === BigInt(p.value)
    );
  };
  const checkPending = async () => {
    const p = pendingRef.current;
    if (!p || lock.current) return;
    lock.current = true;
    setChecking(true);
    let known = false;
    try {
      const receipt = await vault.client.getTransactionReceipt({
        hash: p.hash,
      });
      if (receipt.status !== "success") {
        known = true;
        throw new Error(
          "Transaction reverted. Refresh state before trying again.",
        );
      }
      const correct = await validateMined(p);
      known = true;
      if (!correct)
        throw new Error(
          "Transaction was replaced with a different action. Refresh the vault.",
        );
      await vault.refresh(receipt.blockNumber);
      update(p.key, {
        phase: "success",
        message: `${p.label} confirmed.`,
        hash: p.hash,
      });
    } catch (e) {
      update(p.key, {
        phase: known ? "error" : "confirming",
        message: known
          ? readableError(e)
          : "Confirmation is still unknown. Check the explorer or retry the receipt check; do not submit a duplicate.",
        hash: p.hash,
      });
    } finally {
      if (known) forget(p);
      lock.current = false;
      setChecking(false);
    }
  };
  const run = async (
    key: string,
    label: string,
    call: ContractCall,
  ): Promise<boolean> => {
    if (lock.current || pendingRef.current) return false;
    lock.current = true;
    setBusy(true);
    const epoch = wallet.epoch.current,
      account = wallet.address,
      provider = wallet.provider;
    let submitted: PendingTx | undefined,
      known = false;
    try {
      if (!account || !provider || !wallet.correct)
        throw new Error("Connect your wallet on the deployment network first.");
      if (
        !vault.verified ||
        !vault.data ||
        Date.now() - vault.data.verifiedAt > 45000
      )
        throw new Error("Refresh the verified contract state before signing.");
      const guard = async () => {
        const [chain, accounts] = await Promise.all([
          provider.request({ method: "eth_chainId" }),
          provider.request({ method: "eth_accounts" }),
        ]);
        if (
          Number(chain) !== runtime.deployment.chainId ||
          !sameAddress(accounts[0], account) ||
          wallet.epoch.current !== epoch
        )
          throw new Error(
            "Wallet or network changed. Refresh and retry from the current wallet.",
          );
      };
      await guard();
      update(key, {
        phase: "simulating",
        message: `Checking ${label.toLowerCase()}…`,
      });
      const simulation = await vault.client.simulateContract({
        ...call,
        account,
      });
      await guard();
      update(key, {
        phase: "signing",
        message: `Confirm ${label.toLowerCase()} in your wallet.`,
      });
      const wc = createWalletClient({
        account,
        chain: runtime.chain,
        transport: custom(provider),
      });
      const hash = await wc.writeContract(simulation.request);
      submitted = {
        hash,
        address: call.address,
        data: encodeFunctionData({
          abi: call.abi,
          functionName: call.functionName,
          args: call.args,
        }),
        value: (call.value ?? 0n).toString(),
        account,
        key,
        label,
      };
      remember(submitted);
      update(key, {
        phase: "confirming",
        message: `${label} submitted. Waiting for confirmation… Keep this page open.`,
        hash,
      });
      const receipt = await vault.client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 180000,
        onReplaced: (replacement) => {
          submitted!.hash = replacement.transactionReceipt.transactionHash;
          remember(submitted!);
          update(key, {
            phase: "confirming",
            message: "Replacement transaction detected. Checking confirmation…",
            hash: submitted!.hash,
          });
        },
      });
      if (receipt.status !== "success") {
        known = true;
        throw new Error(
          "Transaction reverted. Refresh state before trying again.",
        );
      }
      const mined = await vault.client.getTransaction({
        hash: receipt.transactionHash,
      });
      known = true;
      if (
        mined.input !== submitted.data ||
        !sameAddress(mined.to ?? undefined, call.address) ||
        !sameAddress(mined.from, account) ||
        mined.value !== (call.value ?? 0n)
      )
        throw new Error(
          "Transaction was replaced with a different action. Refresh the vault.",
        );
      await vault.refresh(receipt.blockNumber);
      update(key, {
        phase: "success",
        message: `${label} confirmed.`,
        hash: receipt.transactionHash,
      });
      return true;
    } catch (e) {
      update(key, {
        phase: submitted && !known ? "confirming" : "error",
        message:
          submitted && !known
            ? "Confirmation is not yet known. Use “Check pending transaction” before trying another action."
            : readableError(e),
        hash: submitted?.hash,
      });
      return false;
    } finally {
      if (submitted && known) forget(submitted);
      lock.current = false;
      setBusy(false);
    }
  };
  return {
    run,
    states,
    busy: busy || !!pending,
    pending: !!pending,
    pendingHash: pending?.hash,
    checking: checking || busy,
    checkPending,
  };
}
export type Transactions = ReturnType<typeof useTransactions>;
