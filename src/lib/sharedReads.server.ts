/** Process-local coalescing only. Failure is never cached; each pinned block has its own key. */
const reads = new Map<string, { expires: number; createdAt: number; promise: Promise<unknown> }>();
export function sharedRead<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = reads.get(key);
  if (hit && hit.expires > Date.now() && hit.createdAt <= Date.now())
    return hit.promise as Promise<T>;
  const entry = {
    expires: Date.now() + ttl,
    createdAt: Date.now(),
    promise: Promise.resolve().then(load) as Promise<T>,
  };
  if (reads.size >= 256) reads.clear();
  reads.set(key, entry);
  entry.promise.catch(() => {
    if (reads.get(key) === entry) reads.delete(key);
  });
  return entry.promise;
}
export type LivePoolSnapshot = { pair: `0x${string}`; tok: bigint; bnb: bigint; price: number };
const pools = new Map<string, { at: number; pool: LivePoolSnapshot }>();
const poolKey = (token: string, rpc: string, block: bigint) =>
  `${rpc}:${token.toLowerCase()}:${block}`;
export function saveLivePool(token: string, rpc: string, block: bigint, pool: LivePoolSnapshot) {
  if (pools.size >= 256) pools.clear();
  pools.set(poolKey(token, rpc, block), { at: Date.now(), pool });
}
export function loadLivePool(token: string, rpc: string, block: bigint) {
  const hit = pools.get(poolKey(token, rpc, block));
  return hit && Date.now() >= hit.at && Date.now() - hit.at < 5000 ? hit.pool : null;
}
