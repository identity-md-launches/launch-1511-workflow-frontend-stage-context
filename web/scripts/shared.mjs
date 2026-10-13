import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { keccak256, toBytes } from "viem";
export const root = fileURLToPath(new URL("../../", import.meta.url));
export const dist = join(root, "dist");
export const readJSON = async (path) =>
  JSON.parse(await readFile(path, "utf8"));
export const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical(value[k])]),
        )
      : value;
export const abiHash = (abi) =>
  keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2);
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const safePath = (path) =>
  typeof path === "string" &&
  /^[a-zA-Z0-9_./-]+$/.test(path) &&
  !path.startsWith("/") &&
  !path.split("/").some((p) => p === ".." || p === "." || p === "");
export async function files(dir, prefix = "") {
  const result = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) throw new Error("Symlinks cannot be exported");
    const path = prefix + e.name;
    if (e.isDirectory())
      result.push(...(await files(join(dir, e.name), path + "/")));
    else result.push(path);
  }
  return result.sort();
}
export async function verifyManifest(manifest) {
  const keys = [
    "version",
    "launchId",
    "chainId",
    "sourceCommit",
    "attestationHash",
    "contracts",
    "assets",
    "poolKey",
    "network",
    "walletAddChain",
  ];
  if (Object.keys(manifest).some((k) => !keys.includes(k)))
    throw new Error("Unexpected manifest key");
  if (manifest.version !== 1 || manifest.chainId !== manifest.network?.chainId)
    throw new Error("Invalid chain/version");
  if (
    !/^[a-f0-9]{64}$/.test(manifest.attestationHash) ||
    !/^[a-f0-9]{40}$/.test(manifest.sourceCommit)
  )
    throw new Error("Invalid source binding");
  const actual = (await files(dist)).filter((p) => p !== "imd-deployment.json");
  if (
    actual.length > 128 ||
    JSON.stringify(actual) !==
      JSON.stringify(manifest.assets.map((a) => a.path).sort())
  )
    throw new Error("Asset inventory differs");
  let total = 0;
  for (const asset of manifest.assets) {
    if (!safePath(asset.path) || !/^[a-f0-9]{64}$/.test(asset.sha256))
      throw new Error("Invalid asset entry");
    const bytes = await readFile(resolve(dist, asset.path));
    if (bytes.length > 8388608 || sha256(bytes) !== asset.sha256)
      throw new Error(`Asset mismatch: ${asset.path}`);
    total += bytes.length;
  }
  if (total > 24 * 1024 * 1024)
    throw new Error("Export exceeds conservative response budget");
  for (const contract of manifest.contracts) {
    if (!safePath(contract.abiPath)) throw new Error("Invalid ABI path");
    const abi = await readJSON(join(dist, contract.abiPath));
    if (!Array.isArray(abi) || abiHash(abi) !== contract.abiHash)
      throw new Error(`ABI mismatch: ${contract.name}`);
  }
  return { assets: actual.length, bytes: total };
}
