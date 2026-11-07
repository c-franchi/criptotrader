# CryptoBot — bloqueios da implantação e revisão de segurança (06/11/2026)

Este documento prepara a **homologação**, não autoriza mudanças em produção.

## Evidência do Lovable
- Publicação analisada: commit `d86220b`; código local era `3b9ca21`. A revisão deste documento terá um novo commit; publicação deve ser comprovada separadamente.
- Banco original do projeto transferido de workspace, com 15 registros Drizzle até `0014` e objetos finais compatíveis com `0015`–`0021`. Migrações `0022` e `0023` ausentes.
- Em GTE há sete vendas confirmadas: quatro originadas do robô e três manuais; nenhuma possui BNB recebido comprovado no banco.
- `grid-tick` (2 segundos) e `alert-tick` ativos; não alterar.
- Tela de backup exibia o snapshot de **06/11/2026 09:51:08 UTC**. Não é prova de restauração bem-sucedida ou de ser o mais recente.

## Correções para homologar
1. `0023`: a função `queue_sale_accounting` agora executa como o **proprietário confiável da migração** exclusivamente para escrever na fila de serviço. A tabela permanece com RLS e sem acesso direto a `anon`/`authenticated`; `search_path=''`, tabelas qualificadas, `EXECUTE` revogado. **É obrigatório conferir o proprietário e testar INSERT/UPDATE como usuário autenticado em banco isolado**, incluindo operação que não seja manual, falha de acesso indevido à fila e transação sem retorno; nunca confiar apenas no teste estático.
2. **Lucro estrito**: recibo PancakeSwap V2 com eventos WBNB permanece evidência auxiliar, **não confirma o BNB nativo recebido**. A confirmação exige `debug_traceTransaction` com execução bem-sucedida, transação esperada, carteira, destinatário, hash, cadeia BSC (56), bloco canônico, valor transferido e retorno positivo. Valores da cotação e diferenças do saldo BNB agregado não podem comprovar lucro. Se o provedor não tiver trace, contabilidade = pendente.
3. Resultados antigos que foram categorizados exclusivamente como `pancake_v2_wbnb_receipt` são mascarados como pendentes no relatório do robô, sem apagar os registros para auditoria.

## Gate operacional
- Não executar `drizzle-kit migrate`, `drizzle push`, reparar registros/snapshots, injetar hashes ou reexecutar `0015`–`0021`.
- Confirmar no Lovable Git/produção e a restauração/exportação independente. Exportar dados requer cuidado especial com credenciais e hashes de usuários. Não restaurar o snapshot antigo em produção para teste.
- Usar `ops/accounting-0023-preflight.sql` como diagnóstico de leitura, seguido de ensaio isolado com mesma estrutura. O mecanismo de migração de produção só poderá avançar com procedimento documentado, aprovado e validado que impeça replay e registre exatamente cada migração.
- Homologar `0022` (histórico de velas) e `0023` (contabilidade) separadamente. Verificar RLS, grants, triggers, idempotência, concorrência e privilégios reais do escritor, sem enviar transações de carteira no ensaio.
- O backfill automático da `0023` cobre apenas **quatro vendas GTE não manuais**; as três vendas manuais exigem auditoria separada. Não mudar sua origem para incluí-las.
- Somente **depois** da autorização de produção e publicação da revisão homologada ativar `market-candle-tick` e `accounting-tick`. Preservar o job `grid-tick`.
- Exigir, no PWA fechado, três execuções efetivas de cada novo job e evidência de candles reais, mais conciliação positiva somente para vendas com trace nativo. Não declarar um lucro apenas com o heartbeat.

## Se o requisito estrito não couber no RPC gratuito
Não mudar automaticamente para saldo antes/depois ou saída estimada do router. Manter o valor pendente e avaliar um provedor de trace histórico, possivelmente pago. A integração não depende de contratar antes de provar que os RPCs gratuitos existentes não atendem.
