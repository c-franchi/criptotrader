# CryptoBot — contabilidade por transação (BNB Smart Chain)

## Fonte de verdade
- **Compras:** valor BNB de entrada no contrato, recibo da BSC, delta real de tokens pelos eventos Transfer, taxas do recibo e gás de aprovações registradas.
- **Vendas PancakeSwap V2:** o hash identifica uma transação específica; a função `swapExactTokensForETHSupportingFeeOnTransferTokens` deve sair da carteira correta, usar o roteador V2 conhecido, a rota exata token→WBNB e o destinatário da carteira. Após conferir cadeia 56, bloco canônico e recibo bem-sucedido, a transferência WBNB do par para o roteador e o evento Withdrawal do WBNB pelo roteador devem coincidir em wei e superar o mínimo do calldata. O código publicado do roteador encaminha exatamente essa retirada como BNB para o destinatário. Isso é contabilidade por **transação**, não diferença de saldo.
- **Fallback:** rastreamento de chamadas (`debug_traceTransaction`) somente quando disponível; deve corresponder ao mesmo hash, chain ID, bloco, destinatário e chamada esperada. Sem provas, `actual_bnb_received` continua nulo e o lucro fica *pendente*.
- **Saldo da carteira:** indicador agregado e reserva lógica. Nunca é prova isolada do retorno de uma venda, especialmente quando há vários bots/tokens na mesma carteira.

## Ativação em produção, sem consumir créditos Lovable
1. Publicar o commit aprovado na PR em seu serviço de deploy. Merge não garante publicação PWA.
2. Executar `drizzle/migrations/0023_order_accounting_retry.sql` **no banco conectado ao workspace publicado**, depois de conferir backup/migrações existentes. O script cadastra vendas antigas sem recebimento confirmado em uma fila que só o service-role pode consultar ou alterar. Nenhum dado ou saldo histórico é reescrito.
3. Com o endpoint `/api/public/hooks/accounting-tick` já publicado, executar `ops/accounting-tick-cron.sql` no mesmo banco. Reutiliza a autenticação do job `grid-tick`, sem exibir segredos.
4. Em **Integrações**, conferir "Conciliação BNB por transação" e "Conciliação automática com aplicativo fechado". Monitorar `accounting_worker_heartbeat` e o número de vendas pendentes; não confundir "agendado" com "conciliado".
5. Na aba **Robô → Histórico**, conferir novamente a venda de GTE. Se o recibo corresponder à rota suportada e contiver os eventos exigidos, o BNB recebido e o lucro serão apresentados; se não, permanecem pendentes. Nenhuma nova ordem será enviada.

## Auditoria e segurança
- A apuração usa wei/bigint e `formatEther` decimal textual, sem arredondar antes de gravar em `numeric`.
- O registro do diário de execução é atômico com a confirmação da ordem; a reconciliação posterior adiciona prova ao `audit_log` antes de atualizar o recebimento.
- Uma prova só vale para o mesmo usuário, carteira, token, par, hash e bloco. A fila usa `FOR UPDATE SKIP LOCKED` para evitar duas instâncias concorrentes tomando a mesma tarefa e faz novas tentativas espaçadas.
- A auditoria não utiliza chaves privadas, não envia swaps, não cancela nem reinicia bots, não muda limites de ordens, reservas ou stops.
- O saldo contábil **por bot** é construído dos hashes atribuídos a seu `botId` no diário, não de um saldo BNB artificialmente dividido.
- Provedor RPC de leitura gratuito pode impor limite e não garantir todos os recibos antigos. A precisão exige a prova; indisponibilidade deve ser informada, nunca mascarada com preço estimado ou diferença de saldo.

## Conferências SQL seguras
```sql
SELECT jobname, active, schedule, jobid FROM cron.job
WHERE jobname IN ('grid-tick','accounting-tick');

SELECT last_run_at,verified,pending,errors FROM public.accounting_worker_heartbeat WHERE id=1;

SELECT count(*) AS vendas_pendentes FROM public.order_accounting_retry
WHERE resolved_at IS NULL;

SELECT o.tx_hash,o.created_at,o.actual_bnb_received,o.accounting_status
FROM public.orders o WHERE o.side='venda' AND o.status='confirmada'
ORDER BY o.created_at DESC LIMIT 20;
```
Nunca envie o conteúdo de `cron.job.command`, segredos do RPC, chaves privadas ou frases de recuperação.
