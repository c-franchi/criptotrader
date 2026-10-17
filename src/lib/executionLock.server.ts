/** Persistent wallet-wide mutex; no expiry can race a still-pending chain transaction. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function acquireExecution(admin: any, userId: string) {
  const owner = crypto.randomUUID();
  const { error } = await admin.from("bot_execution_locks").insert({ user_id: userId, owner });
  if (error) throw new Error("Carteira em execução ou confirmação pendente; aguarde antes de repetir");
  return owner;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function releaseExecution(admin: any, userId: string, owner: string) {
  const { error } = await admin.from("bot_execution_locks").delete().eq("user_id", userId).eq("owner", owner);
  if (error) throw new Error("Não foi possível liberar a execução; verifique o histórico antes de repetir");
}