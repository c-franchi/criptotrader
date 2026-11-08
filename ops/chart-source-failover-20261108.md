# CryptoBot — recuperação de gráficos OHLCV com fontes independentes

## Problema reproduzido
A captura de tela no Android mostra a última vela preservada, um grande aviso "Atualização indisponível" e outro "Gráfico com dados até ...". O preço corrente era consultado independentemente do histórico. A tela anterior tinha duas mensagens redundantes para o mesmo atraso e apenas GeckoTerminal para OHLCV 5 minutos.

## Nova arquitetura — não confundir preço de execução com histórico
- **Fonte 1 (padrão):** GeckoTerminal, OHLCV verdadeiro de 5 minutos da **pool selecionada** na BSC; mantém arquivo histórico PostgreSQL e cache local. Sem chave.
- **Fonte 2 (opcional):** DexPaprika **OHLCV por token, em USD**, com velas genuínas de 5 minutos agregadas por volume de várias pools. Somente para visualização; **não é idêntica à pool do executor**. Só consulta quando a fonte principal não traz velas recentes ou falha, e só usa a segunda fonte se a vela dela for comprovadamente mais recente. Não mistura candles com metodologias distintas.
- **Segregação:** o servidor do executor ainda usa exclusivamente `readCandles(..., { fast: true })` e nunca chama DexPaprika. O novo `getChartFeed` é apenas das telas.
- **Persistência:** velas do DexPaprika não entram em `market_candle_bars` nem em `price_candles` da estratégia; cache no navegador guarda fonte por carteira+pool+token. Não combina uma página antiga do Gecko com uma série de outra fonte.
- **Experiência móvel:** elimina dois avisos laranja duplicados. Exibe um estado compacto, horário da última vela confirmada, origem do dado e preço atual separado. Não cria velas inexistentes nem marca dados antigos como recentes.
- **Segurança:** nenhuma alteração na lógica de compra, venda, stop, saldo, assinatura, carteira, segredos, reconciliação ou ordens.

## Como habilitar a fonte 2 no Lovable, opcional
1. Contratar **DexPaprika Dev ou Pro**, caso a conta tenha direito à consulta de OHLCV por token em **5m**. Planos gratuitos não oferecem o mesmo endpoint/intervalo.
2. Criar a variável **server-side secret** `DEXPAPRIKA_API_KEY` com a chave, somente no ambiente servidor do Lovable. **Nunca** colocar a chave no frontend, README, repositório, URL, screenshot ou conversa.
3. Publicar a alteração de código. No painel administrativo Integrações aparecerá configuração detectada, que **não** significa API comprovada. Abrir o gráfico do token e testar alternância do provedor caso Gecko falhe. O executor deve permanecer independente.
4. Monitorar o consumo e quota da fonte contratada. Se não configurar, o gráfico continuará usando exclusivamente Gecko + histórico já salvo, com mensagens menores; a segunda fonte não será ativada.

## Pré-condição para coletar com PWA fechado (não resolvida pelo merge)
Em 08/11/2026, a auditoria autenticada não encontrou execuções do `market-candle-tick`. Publicar o frontend **não instala** job do PostgreSQL.
- Não executar SQL de mutação nem ligar bots antes de backup atual comprovadamente recuperável, chave `BOT_KEY_SECRET` recuperável de forma independente e acesso legítimo ao banco Lovable de produção.
- Depois das salvaguardas, auditar `ops/production-scheduler-readiness.sql`; validar migração 0022 e job `market-candle-tick` em ensaio isolado; então instalar conforme `ops/market-candle-cron.sql` mediante autorização específica.
- Recolher três heartbeats com PWA fechado e checar timestamps reais `last_candle_at`. Não assumir que chamada HTTP 200 significa vela nova.
- Fontes reais podem ficar sem negócios por um período. **Ninguém pode garantir atualização de OHLCV em todo intervalo sem fabricar dados**, mesmo com dois provedores. Preço independente e sinal de status permanecem legíveis.

## Pontos para testar após publicar
- Token GTE no Painel (Android): uma única informação de última vela, sem as duas caixas laranja; fonte Gecko ou DexPaprika claramente identificada.
- Meus robôs, Operação manual, Métricas e assistente: mesma etiqueta da fonte da série; revisões continuam exigindo cotação executável atual.
- Fonte 2 desligada: somente Gecko e histórico salvo.
- Fonte 2 mal configurada ou quota esgotada: manter último dado verificado, sem consulta à API de trade e sem perda de histórico.
- Fonte 2 habilitada: testar resposta real OHLCV 5m, timestamps UTC, pares de dados separados, nunca como prova de execução/recebimento financeiro.
