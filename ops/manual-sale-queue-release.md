# CryptoTrader — correção da fila das vendas manuais (GitHub, sem créditos Lovable)

Status: **código preparado em branch de revisão; NÃO aplicado ao banco nem publicado**.

## Problema constatado
A função `public.queue_sale_accounting()` criada pela 0023 usa `NEW.source <> 'manual'` e o backfill da 0023 também exclui `source='manual'`. Assim, as vendas manuais GTE confirmadas não são enfileiradas. A função `claim_order_accounting(integer)` já verifica `side='venda'`, `status='confirmada'` e `actual_bnb_received IS NULL`, não exige origem `robo`.

## Mudança isolada
O arquivo `ops/manual-sale-accounting-queue.sql`:
- exige que a fila, o trigger e o claim da 0023 já existam, abortando se não existirem;
- preserva `SECURITY DEFINER` com `search_path=''` e a ausência de permissão para `anon`/`authenticated`;
- altera **somente** a função do trigger existente, para atender vendas confirmadas tanto manuais quanto automáticas;
- enfileira as vendas manuais históricas confirmadas ainda sem BNB apurado e que têm hash, sem duplicar os itens existentes;
- nunca regrava `orders.actual_bnb_received`, estado dos robôs, carteiras, histórico ou estratégias;
- não cria, executa nem habilita agendador.

## Pré-condições OBRIGATÓRIAS para execução em produção
1. Exportação **atualizada, baixada e recuperável**, posterior às correções de 07/11/2026, com horário UTC anotado.
2. Backup separado e recuperável da variável `BOT_KEY_SECRET` pelo proprietário, sem expor segredo em e-mail, chat ou repositório.
3. Confirmação de que o banco alvo é o banco real vinculado à publicação e de que as migrações 0022/0023 estão instaladas e **não** serão reaplicadas.
4. Verificação de ordens/locks pendentes, robôs desarmados, esquema de permissões e ausência de atividades financeiras simultâneas.
5. Aprovação humana específica para executar o script em produção. Nunca usar `drizzle-kit migrate` como atalho porque o histórico das migrações antigas divergiu.

## Homologação sem dinheiro real
Em banco **descartável** com 0023 instalado, executar o patch, depois `tests/manual-sale-accounting-isolated.sql`. Os testes criam duas vendas artificiais e fazem `ROLLBACK`. Não execute o script de homologação na produção.

O teste unitário `src/lib/manualSaleQueueSql.test.ts` protege o conteúdo e a superfície de alterações. No GitHub Actions, os checks TypeScript, Vitest, build e lint são disparados pela abertura da PR. Checks automáticos não substituem a homologação no PostgreSQL isolado.

## Pendências que o patch NÃO resolve
- A rotina `readAccountingProceeds` exige `debug_traceTransaction` válido (e confronta com recibo se houver), embora a implementação contenha validação adicional dos eventos Pancake V2. **Não remover essa exigência sem evidência e revisão de segurança; resultado não comprovado continua pendente.**
- Configurar `BSC_TRACE_RPC_URL` em **secrets do servidor**, com um provedor que responda `debug_traceTransaction` para as transações históricas desejadas. Nunca colocar esse endpoint com credenciais no cliente ou no GitHub.
- Os agendadores contábil e de gráficos seguem **desligados**. Ativar somente após teste de ciclo inteiro, backup e aprovação.
- O patch não publica o site. Um merge no GitHub não equivale à publicação do projeto no Lovable.

## Verificação de produção — somente leitura (após aprovação de execução)
```sql
SELECT o.source, count(*) AS pendentes
FROM public.order_accounting_retry j
JOIN public.orders o ON o.id=j.order_id
WHERE j.resolved_at IS NULL AND o.status='confirmada'
GROUP BY o.source ORDER BY o.source;

SELECT jobname,active,schedule FROM cron.job
WHERE jobname IN ('accounting-tick','market-candle-tick');
```

**Ponto de parada:** qualquer erro de permissão, histórico de migração, divergência de carteiras, backup incompleto ou falta de recuperação de `BOT_KEY_SECRET` impede mutação em produção. A fila de pendentes não é confirmação de lucro.
