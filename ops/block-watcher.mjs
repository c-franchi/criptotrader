// Optional persistent Node.js worker. No wallet keys and no transaction signing here.
import { createPublicClient, webSocket } from "viem";
import { bsc } from "viem/chains";
const { BSC_WSS_URL, BOT_TICK_URL, BOT_TICK_TOKEN } = process.env;
if (!BSC_WSS_URL?.startsWith("wss://") || !BOT_TICK_URL?.startsWith("https://") || !BOT_TICK_TOKEN)
  throw new Error(
    "Configure BSC_WSS_URL, BOT_TICK_URL e BOT_TICK_TOKEN no ambiente seguro do worker.",
  );
let client;
try {
  client = createPublicClient({
    chain: bsc,
    transport: webSocket(BSC_WSS_URL, { retryCount: 0, reconnect: { attempts: 100, delay: 2000 } }),
  });
  if ((await client.getChainId()) !== 56) throw new Error("Rede incorreta");
} catch {
  throw new Error(
    "Não foi possível validar a conexão WSS com a BSC. Confira a configuração segura; nenhum segredo é exibido.",
  );
}
let pending = null,
  running = false,
  stopped = false;
async function drain() {
  if (running || stopped) return;
  running = true;
  try {
    while (pending && !stopped) {
      pending = null; // Keep the newest head only; never queue every historical block.
      try {
        const response = await fetch(BOT_TICK_URL, {
          method: "POST",
          headers: { authorization: `Bearer ${BOT_TICK_TOKEN}`, "x-cryptobot-trigger": "block" },
          signal: AbortSignal.timeout(45000),
          redirect: "error",
        });
        if (!response.ok)
          console.warn(
            "Executor respondeu com indisponibilidade; o agendamento periódico permanece como alternativa.",
          );
      } catch {
        console.warn(
          "Sem resposta do executor; não há assinatura nem reenvio de transações neste worker.",
        );
      }
    }
  } finally {
    running = false;
  }
}
const unwatch = client.watchBlocks({
  poll: false,
  emitMissed: false,
  onBlock(block) {
    const age = Date.now() - Number(block.timestamp) * 1000;
    if (age > 15000 || age < -5000) return;
    pending = block.number;
    void drain();
  },
  onError() {
    console.warn("WebSocket indisponível; mantenha o agendamento periódico ativo.");
  },
});
function stop() {
  stopped = true;
  unwatch();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
console.info(
  "Observador BSC iniciado. Recebe blocos; somente o executor autenticado pode avaliar bots já ligados.",
);
