import { LEGACY_WALLET_SCOPE } from "./walletScope";
/** Independent wallets can progress concurrently; one wallet's nonce sequence remains serial. */
export async function runWalletQueues<T extends { user_id: string; wallet_scope?: string }, R>(
  bots: T[],
  run: (bot: T) => Promise<R>,
  canStart: () => boolean,
  concurrency = 4,
): Promise<R[]> {
  const groups = new Map<string, T[]>();
  for (const bot of bots) {
    const key = `${bot.user_id}:${bot.wallet_scope ?? LEGACY_WALLET_SCOPE}`;
    const queue = groups.get(key) ?? [];
    queue.push(bot);
    groups.set(key, queue);
  }
  const queues = [...groups.values()];
  const results: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), queues.length) }, async () => {
      while (canStart()) {
        const queue = queues[next++];
        if (!queue) return;
        for (const bot of queue) {
          if (!canStart()) break;
          results.push(await run(bot));
        }
      }
    }),
  );
  return results;
}
