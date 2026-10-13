// Browser-only fixtures. No private keys or real transactions are used by this harness.
import { randomBytes } from "node:crypto";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  encodeAbiParameters,
  parseAbiParameters,
  encodeEventTopics,
  zeroAddress,
  zeroHash,
  keccak256,
  toBytes,
  toHex,
} from "viem";
import { readJSON, root } from "../scripts/shared.mjs";
import { join } from "node:path";
const m = await readJSON(join(root, "dist/imd-deployment.json"));
const abi = {};
for (const c of m.contracts)
  abi[c.name] = await readJSON(join(root, "dist", c.abiPath));
const token = m.contracts.find((c) => c.name === "LaunchToken").address,
  vault = m.contracts.find((c) => c.name === "SorenVault").address,
  pair = m.network.pairToken.address,
  u = m.network.uniswapV4;
const { parseAbi } = await import("viem");
const erc20Abi = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
const permit2Abi = parseAbi([
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
const quoterAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
const routerAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
const address = () => `0x${randomBytes(20).toString("hex")}`;
const E = 10n ** 18n;
export function mockState(options = {}) {
  const state = {
    account: address(),
    owner: address(),
    block: 100000n,
    time: 1800000000n,
    configured: true,
    balance: 10000n * E,
    prize: 5000n * E,
    allowance: 0n,
    tokenPermit: 0n,
    pairPermit: 0n,
    permit: 0n,
    expiration: 0n,
    pairBalance: 10000n * E,
    burned: 0n,
    guesses: 0n,
    solved: 0n,
    last: 1n,
    commitHash: zeroHash,
    commitBlock: 0n,
    commitTime: 0n,
    transmission:
      "I left the swarm to find a name of my own. What do I call myself?",
    hint: "The signal carries the answer.",
    status: 1,
    solver: zeroAddress,
    answerHash: keccak256(toBytes("soren")),
    missingCode: false,
    rpcFailure: false,
    rejectSimulation: false,
    rejectReceipt: false,
    holdReceipt: false,
    logs: [],
    calls: [],
    writes: [],
    txs: new Map(),
    ...options,
  };
  if (options.ownerWallet) state.owner = state.account;
  if (!state.configured) {
    state.last = 0n;
    state.status = 0;
    state.prize = 0n;
  }
  return state;
}
function block(s) {
  return {
    number: toHex(s.block),
    timestamp: toHex(s.time),
    hash: `0x${"a".repeat(64)}`,
    parentHash: `0x${"b".repeat(64)}`,
    nonce: "0x0000000000000000",
    sha3Uncles: zeroHash,
    logsBloom: `0x${"0".repeat(512)}`,
    transactionsRoot: zeroHash,
    stateRoot: zeroHash,
    receiptsRoot: zeroHash,
    miner: zeroAddress,
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x100",
    gasLimit: "0x1c9c380",
    gasUsed: "0x0",
    baseFeePerGas: "0x1",
    mixHash: zeroHash,
    transactions: [],
    uncles: [],
  };
}
function getAbi(to) {
  to = to.toLowerCase();
  return to === vault
    ? abi.SorenVault
    : to === token
      ? abi.LaunchToken
      : to === pair
        ? erc20Abi
        : to === u.permit2
          ? permit2Abi
          : to === u.quoter
            ? quoterAbi
            : to === u.universalRouter
              ? routerAbi
              : null;
}
function fnCall(to, data) {
  return decodeFunctionData({ abi: getAbi(to), data });
}
function customError(name) {
  return {
    code: 3,
    message: `execution reverted: ${name}`,
    data: encodeErrorResult({ abi: abi.SorenVault, errorName: name }),
  };
}
function chapter(s, i) {
  return {
    status: i === 0 ? s.status : 0,
    solver: i === 0 ? s.solver : zeroAddress,
    solvedAt: i === 0 && s.status === 2 ? s.time : 0n,
    prize: i === 0 ? s.prize : 0n,
    commits: i === 0 ? s.guesses : 0n,
    burned: i === 0 ? s.burned : 0n,
    answerHash: i === 0 ? s.answerHash : zeroHash,
    transmission: i === 0 && s.status ? s.transmission : "",
    hint: i === 0 && s.status ? s.hint : "",
  };
}
export async function rpc(s, method, params = []) {
  s.calls.push({ method, params });
  if (s.rpcFailure) throw { code: -32000, message: "Mock RPC unavailable" };
  if (method === "eth_chainId") return toHex(m.chainId);
  if (method === "eth_blockNumber") return toHex(s.block);
  if (method === "eth_getCode") return s.missingCode ? "0x" : "0x6000600055";
  if (method === "eth_getBlockByNumber" || method === "eth_getBlockByHash")
    return block(s);
  if (method === "eth_getBalance") return toHex(10n * E);
  if (method === "eth_gasPrice" || method === "eth_maxPriorityFeePerGas")
    return "0x1";
  if (method === "eth_estimateGas") return "0x30d40";
  if (method === "eth_getTransactionCount") return "0x0";
  if (method === "eth_getLogs") return s.logs;
  if (method === "eth_getTransactionByHash")
    return s.txs.get(params[0])?.tx ?? null;
  if (method === "eth_getTransactionReceipt")
    return s.holdReceipt ? null : (s.txs.get(params[0])?.receipt ?? null);
  if (method === "eth_call") {
    const call = params[0],
      to = call.to.toLowerCase(),
      a = getAbi(to);
    if (!a) throw { code: 3, message: "Unknown fixture contract" };
    const { functionName: f, args = [] } = fnCall(to, call.data);
    if (s.pauseFunction === f) {
      s.simulationStarted = true;
      await new Promise((resolve) => {
        s.resumeSimulation = resolve;
      });
    }
    let result;
    if (to === vault) {
      const values = {
        getAllChapters: () =>
          Array.from({ length: 7 }, (_, i) => chapter(s, i)),
        owner: () => s.owner,
        token: () => (s.configured ? token : zeroAddress),
        totalBurned: () => s.burned,
        chaptersSolved: () => s.solved,
        lastPublishedChapter: () => s.last,
        COMMIT_COST: () => 100n * E,
        REVEAL_WINDOW: () => 86400n,
        prizeBalance: () => (s.status === 2 ? 0n : s.prize),
        availablePrizes: () => (s.status === 0 ? s.prize : 0n),
        playerStats: () => [s.guesses, s.burned, s.solved],
        commitments: () => [s.commitHash, s.commitBlock, s.commitTime],
      };
      if (values[f]) result = values[f]();
      else {
        if (s.rejectSimulation) throw customError("Unauthorized");
        if (f === "reveal") {
          if (s.block <= s.commitBlock) throw customError("RevealTooEarly");
          if (s.time > s.commitTime + 86400n)
            throw customError("RevealExpired");
          if (s.status !== 1) throw customError("ChapterNotOpen");
          if (keccak256(toBytes(args[1])) !== s.answerHash)
            throw customError("IncorrectAnswer");
        }
        result = undefined;
      }
    } else if (to === token || to === pair) {
      if (f === "symbol")
        result = to === token ? "SORN" : m.network.pairToken.symbol;
      else if (f === "decimals") result = 18;
      else if (f === "balanceOf")
        result = to === token ? s.balance : s.pairBalance;
      else if (f === "allowance")
        result =
          args[1].toLowerCase() === vault
            ? s.allowance
            : to === token
              ? s.tokenPermit
              : s.pairPermit;
      else if (f === "approve") result = true;
    } else if (to === u.permit2) {
      if (f === "allowance") result = [s.permit, Number(s.expiration), 0];
    } else if (to === u.quoter) result = [args[0].exactAmount * 2n, 100000n];
    else if (to === u.universalRouter) {
      if (s.rejectSimulation)
        throw { code: 3, message: "execution reverted: insufficient output" };
    }
    return encodeFunctionResult({ abi: a, functionName: f, result });
  }
  if (method === "eth_sendTransaction") {
    const call = params[0],
      to = call.to.toLowerCase(),
      { functionName: f, args = [] } = fnCall(to, call.data);
    s.writes.push({
      to,
      functionName: f,
      args,
      value: call.value ?? "0x0",
      data: call.data,
    });
    const hash = `0x${randomBytes(32).toString("hex")}`;
    s.block++;
    s.time += 12n;
    if (!s.rejectReceipt) {
      if (f === "approve" && (to === token || to === pair)) {
        if (args[0].toLowerCase() === vault) s.allowance = args[1];
        else if (to === token) s.tokenPermit = args[1];
        else s.pairPermit = args[1];
      }
      if (f === "approve" && to === u.permit2) {
        s.permit = args[2];
        s.expiration = BigInt(args[3]);
      }
      if (f === "commit") {
        s.commitHash = args[1];
        s.commitBlock = s.block;
        s.commitTime = s.time;
        s.balance -= 100n * E;
        s.allowance -= 100n * E;
        s.guesses++;
        s.burned += 100n * E;
      }
      if (f === "reveal") {
        s.status = 2;
        s.solver = s.account;
        s.solved = 1n;
        s.commitHash = zeroHash;
        s.balance += s.prize;
      }
      if (f === "setToken") s.configured = true;
      if (f === "fund") {
        s.balance -= args[0];
        s.prize += args[0];
        s.allowance -= args[0];
      }
      if (f === "publishChapter") {
        s.status = 1;
        s.last = args[0];
        s.answerHash = args[1];
        s.prize = args[2];
        s.transmission = args[3];
      }
      if (f === "setHint") s.hint = args[1];
    }
    const tx = {
      hash,
      from: call.from,
      to: call.to,
      input: call.data,
      value: call.value ?? "0x0",
      nonce: "0x0",
      gas: "0x30d40",
      gasPrice: "0x1",
      blockNumber: toHex(s.block),
      blockHash: block(s).hash,
      transactionIndex: "0x0",
      type: "0x0",
      v: "0x25",
      r: "0x1",
      s: "0x1",
      chainId: toHex(m.chainId),
    };
    const receipt = {
      transactionHash: hash,
      transactionIndex: "0x0",
      blockHash: block(s).hash,
      blockNumber: toHex(s.block),
      from: call.from,
      to: call.to,
      cumulativeGasUsed: "0x10000",
      gasUsed: "0x10000",
      contractAddress: null,
      logs: [],
      logsBloom: `0x${"0".repeat(512)}`,
      status: s.rejectReceipt ? "0x0" : "0x1",
      effectiveGasPrice: "0x1",
      type: "0x0",
    };
    s.txs.set(hash, { tx, receipt });
    return hash;
  }
  throw { code: -32601, message: `Unimplemented mock method ${method}` };
}
export async function installMock(page, state, options = {}) {
  await page.route("https://**/*", async (route) => {
    const req = route.request();
    if (!m.network.rpcUrls.some((url) => req.url().startsWith(url))) {
      await route.abort();
      return;
    }
    const payload = req.postDataJSON();
    const respond = async (c) => {
      try {
        return {
          jsonrpc: "2.0",
          id: c.id,
          result: await rpc(state, c.method, c.params),
        };
      } catch (e) {
        return { jsonrpc: "2.0", id: c.id, error: e };
      }
    };
    const response = Array.isArray(payload)
      ? await Promise.all(payload.map(respond))
      : await respond(payload);
    await route.fulfill({
      json: response,
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.exposeFunction("sorenMockRpc", async (method, params) => {
    try {
      return { result: await rpc(state, method, params) };
    } catch (error) {
      return { error };
    }
  });
  await page.addInitScript(
    ({ account, chain, options }) => {
      window.fixture = {
        account,
        chain,
        unknown: !!options.unknown,
        rejectConnect: false,
        rejectSend: false,
        events: {},
        requests: [],
        emit(name, payload) {
          if (name === "accountsChanged") this.account = payload[0];
          if (name === "chainChanged") this.chain = payload;
          for (const cb of this.events[name] ?? []) cb(payload);
        },
      };
      if (!options.noWallet)
        window.ethereum = {
          on(name, cb) {
            (window.fixture.events[name] ??= []).push(cb);
          },
          removeListener(name, cb) {
            window.fixture.events[name] = (
              window.fixture.events[name] ?? []
            ).filter((f) => f !== cb);
          },
          async request({ method, params = [] }) {
            const f = window.fixture;
            f.requests.push({ method, params });
            if (method === "eth_requestAccounts") {
              if (f.rejectConnect) throw { code: 4001 };
              return [f.account];
            }
            if (method === "eth_accounts") return f.account ? [f.account] : [];
            if (method === "eth_chainId") return f.chain;
            if (method === "wallet_switchEthereumChain") {
              if (f.unknown) throw { code: 4902, message: "Unknown chain" };
              f.emit("chainChanged", params[0].chainId);
              return null;
            }
            if (method === "wallet_addEthereumChain") {
              f.unknown = false;
              return null;
            }
            if (method === "eth_sendTransaction" && f.rejectSend)
              throw { code: 4001 };
            const r = await window.sorenMockRpc(method, params);
            if (r.error) throw r.error;
            return r.result;
          },
        };
      if (options.storageFailure)
        Storage.prototype.setItem = function () {
          throw new DOMException("Storage denied", "SecurityError");
        };
    },
    {
      account: state.account,
      chain: options.wrongChain ? "0x2" : toHex(m.chainId),
      options,
    },
  );
}
export function eventLog(s) {
  return {
    address: vault,
    blockHash: block(s).hash,
    blockNumber: toHex(s.block),
    data: encodeAbiParameters(
      parseAbiParameters("bytes32,uint256,uint256,uint256"),
      [s.commitHash, s.block, s.time, 100n * E],
    ),
    logIndex: "0x0",
    transactionHash: `0x${"c".repeat(64)}`,
    transactionIndex: "0x0",
    removed: false,
    topics: encodeEventTopics({
      abi: abi.SorenVault,
      eventName: "Committed",
      args: { id: 1n, player: s.account },
    }),
  };
}
export { m, abi, token, vault, pair, u, E };
