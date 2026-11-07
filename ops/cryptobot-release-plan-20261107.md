# CryptoBot — Plano de correção pós-devolução de fundos
Data: 07/11/2026 · Estado: **PR de apresentação financeira; banco de produção não alterado**.

## 1. Situação e regra de proteção
- O proprietário informou que **retirou os fundos das carteiras automáticas**. Essa declaração não comprova, por si só, o saldo zero em blockchain; conferir **3 endereços**, saldos BNB **e** BEP-20 conhecidos, hashes das transferências, destino e confirmações.
- Auditoria previamente comunicada: **3/3** carteiras criptográficas derivam os endereços corretos com o `BOT_KEY_SECRET`; **8 robôs**, somente uma conta possui robôs. Isso é um *retrato da auditoria*, não uma verificação atual.
- O proprietário não tem seed/chaves independentes. **Jamais apagar `bot_wallets.enc_key`, mudar `BOT_KEY_SECRET`, remover carteiras, recriar banco ou restaurar snapshot anterior à retirada**.
- Confirmar `grid_bots.armed = false` em todos os robôs antes de mexer em esquema, inclusive quando o BNB parecer zerado. Não desarmar automaticamente via migração; o proprietário deve controlar e conferir no app. Não zerar `strat_state`, reservas, estados, travas nem hashes para forçar inconsistências a desaparecerem.
- Verificar que `execution_submissions` sem `finished_at` e `bot_execution_locks` não indicam ações em andamento. **Não limpar travas manualmente** se houver pendências.
- Precisa de **backup NOVO após os saques**, com prova de disponibilidade e carimbo UTC; o snapshot de 06/11/2026 09:51:08 UTC é antigo para uma eventual restauração agora. A recuperação do `BOT_KEY_SECRET` continua sendo uma dependência separada do backup de dados.
- A exportação de banco e arquivos com chaves criptografadas são confidenciais. Nunca incluir dados sensíveis em pull requests, logs, prints públicos ou mensagens.

## 2. Auditoria financeira do GTE (exemplo reproduzível)
Compras/vendas com endereços da mesma carteira, transferências de BEP-20 e registro de eventos da PancakeSwap V2:
- Compra: [BscScan](https://bscscan.com/tx/0x50ad5fe9860fca528b85489d5089065ad8d7a6251dd3e0c2d3a804577109c9a6). BNB enviado: **0,005199212254810774**; tokens recebidos já refletem imposto de compra. Gas **0,00000731915** BNB.
- Venda: [BscScan](https://bscscan.com/tx/0x79ca3fa52151e88cd994aa4aac19133e692711805a061e321a6b2f124ba26ae9). WBNB retirado pelo roteador: **0,007164175836730549** BNB de saída indicada; gas **0,000007643** BNB. **Ainda não há prova independente do trace de transferência nativa para carteira receptora**: não gravar como `actual_bnb_received` confirmado nem apresentar lucro comprovado.
- Aprovação do token GTE: hash `0xe8120e17daedb77ed5947bba7ca923a1922568dc81ccf47db82061a924ed6ad4`; gas **0,00000234555** BNB.
- Tentativa inicial de compra revertida: hash `0x62c681cebe912bbdea5fc03351c9a7c5571f330c362a4481d387794b45fde2b5`; gas **0,00000800465** BNB; o BNB destinado à compra revertida não foi gasto, somente seu gas.
- **Total gas** incluindo tentativa falha e aprovação: **0,00002531235 BNB** (não cobrar gas de aprovação duas vezes quando ele já consta em `orders.gas_bnb`).
- **Saldo econômico estimado**, condicionando o recebimento nativo da venda ao que o router retirou: `0,007164175836730549 - 0,005199212254810774 - 0,00002531235 = +0,001939651231919775 BNB`.
- Aproximação anteriormente apresentada: **≈ R$ 7,40** ao usar **R$ 3.814,88/BNB**, ilustrativa e **não** um crédito de reais recebido/realizado.
- ROI de referência **37,13%** sobre custo de compra + gas. Se algum custo estiver fora da associação ao robô, a UI deve indicar essa limitação.
- Configuração de token `GTE` conhecida no código: `KNOWN_TAX` usa **8% de compra e 8% de venda**. As transferências BEP-20 e WBNB observadas **já refletem as taxas do token**. **Não subtrair 8% + 8% mais uma vez** dos valores efetivos.
- Metas futuras de venda devem considerar taxa de entrada, taxa de saída, spread, impacto e gas; já o **lucro realizado** é medido por tokens/BNB efetivamente movimentados com evidência confirmada.

## 3. Melhorias na experiência de contabilidade (GitHub)
- Painel do robô: **resultado BNB**, **resultado aproximado BRL à cotação atual** (nunca confundir com preço histórico), **ROI sobre compras e gas**, taxas de token conhecidas, e explicação de que taxas estão embutidas nos valores líquidos.
- Sem prova `debug_traceTransaction` válida: **lucro pendente**, nada de usar cotação ou evento WBNB isolado como comprovante de caixa. BRL não pode ser inventado.
- Gas de falhas/aprovações só pode ser deduzido **uma vez**; transações externas ou não associadas ao robô podem ficar fora do relatório. Isso exige auditoria por hashes para totalização exaustiva.

## 4. Migrações ainda pendentes em produção
1. Executar **somente leitura** `ops/post-withdrawal-preflight.sql` e `ops/accounting-0023-preflight.sql`; registrar contagem, estados dos bots, filas e histórico. Não publicar `BOT_KEY_SECRET` nem dados `enc_key`.
2. Obter backup atualizado e comprovar o banco exato, a branch GitHub `c-franchi/criptotrader/main` e commit efetivamente publicado. Fundo retirado não dispensa esses gates.
3. O histórico **Drizzle só vai até 0014**, enquanto o esquema atual equivale a 0015–0021. **Não executar `drizzle-kit migrate` nem inserir hashes/timestamps por tentativa**; a reconciliação suportada precisa ser verificada e ensaiada em isolamento ou em mecanismo transacional aprovado que impeça replay.
4. Aplicar **0022** (arquivo de velas) **somente após** reconciliação de ledger validada; conferir tabelas, RPC, grants e cron ainda desligado.
5. Aplicar **0023** (fila contábil, backfill das vendas não manuais) separadamente; conferir proprietário real do trigger, direitos `authenticated`, serviço, índice/constraints e idempotência; cron ainda desligado.
6. Publicar a revisão aprovada, conferir o SHA ao vivo, confirmar login, saldos e ausência de novo trade. O código pode estar mesclado no GitHub mas **não implantado** no Lovable.
7. Ativar **`market-candle-tick` (1 minuto)** e **`accounting-tick` (2 minutos)** separadamente, com autorização de destino verificada. Manter `grid-tick` e `alert-tick` intactos, mesmo quando os robôs estão desarmados.
8. Exigir 3 heartbeats/ciclo de cada tarefa sem PWA aberto, candle persistido por mais de 5 min, controle de acesso e contabilização GTE confirmada somente se houver trace nativo.

## 5. Critério de parada
Qualquer pendência financeira em blockchain, bot armado, transação não finalizada, chave não recuperável, backup anterior aos saques, permissão incorreta, reexecução de SQL de 0015–0021 ou tentativa de confirmar receita sem trace: **parar antes de alterar produção**.

**O que ficou feito neste plano:** implementação em código/relatório e SQL de pré-inspeção, sem rodar queries nem migrar/ativar crons em produção.
