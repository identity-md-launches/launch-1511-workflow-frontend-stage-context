import {
  createPublicClient,
  custom,
  defineChain,
  fallback,
  http,
  keccak256,
  toBytes,
  isAddress,
  type Abi,
  type Address,
  type EIP1193Provider,
} from "viem";
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export type PairToken = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
};
export type Deployment = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  poolKey?: PoolKey;
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[];
    uniswapV4?: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
    pairToken?: PairToken;
    otherPairTokens?: PairToken[];
  };
  walletAddChain?: {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
};
export type Runtime = {
  deployment: Deployment;
  abis: Record<string, Abi>;
  chain: ReturnType<typeof defineChain>;
};
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
const relativePath = (path: string) =>
  /^[A-Za-z0-9_./-]+$/.test(path) &&
  !path.startsWith("/") &&
  !path.split("/").some((s) => !s || s === "." || s === "..");
async function json(path: string) {
  const response = await fetch(new URL(path, document.baseURI), {
    cache: "no-cache",
  });
  if (!response.ok) throw new Error(`Could not load ${path}. Reload the site.`);
  return response.json();
}
export async function loadRuntime(): Promise<Runtime> {
  const deployment: Deployment = await json("imd-deployment.json");
  if (
    deployment.version !== 1 ||
    !deployment.network ||
    deployment.chainId !== deployment.network.chainId ||
    !deployment.network.rpcUrls.length
  )
    throw new Error(
      "Deployment configuration is invalid. Transactions are disabled.",
    );
  const abis: Record<string, Abi> = {};
  for (const contract of deployment.contracts) {
    if (!isAddress(contract.address) || !relativePath(contract.abiPath))
      throw new Error("Invalid contract configuration.");
    const abi = await json(contract.abiPath);
    if (
      !Array.isArray(abi) ||
      keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2) !==
        contract.abiHash
    )
      throw new Error(
        `ABI verification failed for ${contract.name}. Transactions are disabled.`,
      );
    abis[contract.name] = abi;
  }
  for (const name of ["LaunchToken", "SorenVault"])
    if (!abis[name]) throw new Error(`Missing ${name} in deployment.`);
  const n = deployment.network;
  const chain = defineChain({
    id: deployment.chainId,
    name: n.name,
    nativeCurrency: n.nativeCurrency,
    rpcUrls: { default: { http: n.rpcUrls } },
    blockExplorers: { default: { name: "Explorer", url: n.explorer } },
    testnet: n.testnet,
  });
  return { deployment, abis, chain };
}
export const contractOf = (r: Runtime, name: string) => {
  const c = r.deployment.contracts.find((c) => c.name === name);
  if (!c) throw new Error(`Missing ${name}`);
  return { address: c.address, abi: r.abis[name] };
};
export function publicClient(r: Runtime, provider?: EIP1193Provider) {
  const transports = r.deployment.network.rpcUrls.map((url) =>
    http(url, { timeout: 9000, retryCount: 0, batch: { wait: 25 } }),
  );
  return createPublicClient({
    chain: r.chain,
    transport: fallback(
      [
        ...transports,
        ...(provider ? [custom(provider, { retryCount: 0 })] : []),
      ],
      { retryCount: 0 },
    ),
    pollingInterval: 4000,
  });
}
export type ReadClient = ReturnType<typeof publicClient>;
