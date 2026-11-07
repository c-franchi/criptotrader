# CryptoTrader — correções de publicação e pendências reais (07/11/2026)

## Mudanças prontas para a publicação
- `src/lib/history.server.ts`: coletor de OHLCV no servidor usa timeout limitado de **6s**, em vez de 1,5s, para evitar falhas ocasionais da API pública. Continua em tentativa única, respeitando espera após HTTP 429, sem inventar velas. Nenhuma alteração em trading, carteira ou assinatura.
- `src/lib/health.functions.ts`: mostra idade da **última vela efetivamente arquivada** (`last_candle_at`) em vez de afirmar que uma consulta bem-sucedida representa preço recente; distingue **fila instalada** de **conciliação automática executando**; indica dependência de `BSC_TRACE_RPC_URL` sem revelar seu valor.
- `src/lib/historyFastRefresh.test.ts`: protege o timeout do coletor.
- `ops/production-scheduler-readiness.sql`: pré-inspeção sem alteração do banco e sem retornar comandos com credenciais.

## O que NÃO é corrigido só pelo botão Publicar
Os jobs `market-candle-tick` e `accounting-tick` são registrados em `pg_cron` no banco, não pelo bundle React. Publicação do código **não os instala nem ativa**. Eles estavam ausentes na última auditoria: executar o script de preparo não é uma alternativa a ter backup recuperável e chave independente.

A fila das três vendas manuais GTE exige a aplicação supervisionada do patch já versionado em `ops/manual-sale-accounting-queue.sql`, após validação de esquema/migrações. O fato do arquivo estar na `main` não significa que já tenha sido executado no banco.

As sete vendas GTE ainda não têm comprovante do recebimento nativo: o RPC público retornou `missing trie node` ao solicitar os rastros históricos. **Não remover a exigência de evidência** para marcar `actual_bnb_received` como confirmado. Configurar o segredo de servidor `BSC_TRACE_RPC_URL` com um provedor que disponha de `debug_traceTransaction` para o bloco e as transações históricas, após consulta de disponibilidade/custo.

## Sequência de liberação segura (sem transações)
1. Verificar `git main`, commit do deploy no Lovable, acesso à conta e identificador do banco de produção.
2. Obter exportação **nova**, baixada e com recuperação comprovada em banco separado. Preservar `BOT_KEY_SECRET` em canal seguro independente do banco, **sem compartilhar valor** em mensagens, GitHub ou logs. Não reiniciar `bot_wallets.enc_key`.
3. Executar **apenas** `ops/production-scheduler-readiness.sql` no SQL console do banco conectado ao Lovable. Verificar cron jobs e objetos instalados, sem imprimir `cron.job.command`.
4. Testar os dois endpoints HTTP separadamente em ambiente descartável, com credencial de cron apropriada, **sem rodar qualquer trade**. Fazer três ciclos com PWA fechado e inspecionar heartbeats.
5. Depois de autorização do titular, instalar `market-candle-tick` pelo SQL existente em `ops/market-candle-cron.sql` e confirmar que os dados de velas avançam por `last_candle_at`, sem depender do navegador.
6. Somente após validação isolada, habilitar `accounting-tick` conforme `ops/accounting-tick-cron.sql`. Se o RPC histórico não for compatível, as vendas devem seguir **pendentes**, sem ganhos fictícios.
7. Após teste separado e **autorização específica**, aplicar o patch manual da fila das vendas GTE sem repetir Drizzle 0015–0024.
8. Confirmar que `grid-tick` continua em dois segundos, sem mudanças no executor, e que 8 robôs/3 carteiras/histórico seguem íntegros.

## Critérios para finalizar
- Código compilado, testes unitários passando, nenhum novo erro de lint em arquivos alterados.
- 3 ciclos de `market-candle-tick` sem navegador, com timestamp de heartbeat e de velas coerentes.
- 3 ciclos de `accounting-tick` sem navegador e zero escritas financeiras sem evidência.
- Fila de vendas manuais confirmadas cadastrada sem duplicar a fila original.
- Contas, robôs e saldo inalterados e backup demonstradamente recuperável.

**Estado desta correção:** edição apenas de código e documentação no GitHub; nenhum cron, SQL de mutação, segredo ou trade executado em produção. O proprietário deve autorizar as mudanças posteriores de banco e conferir a publicação no Lovable.
