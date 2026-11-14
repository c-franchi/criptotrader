# Pontos do gráfico fixos em dólares — 14/11/2026

## Causa confirmada no código

O editor convertia cada ponto USD para BNB/token. A regra armazenava apenas `entryBnb`, `exitBnb`, `stopBnb` e os arrays de pontos, com `unit: BNB`. O executor comparava o preço atual nativo com esses limites, e `RobotVision` multiplicava os limites pelo BNB/USD atual para desenhá-los em dólares.

Portanto os pontos eram fixos em BNB, mas não na moeda do gráfico. Se ativo e BNB caíssem juntos, os níveis em dólares também caíam e o preço nativo podia continuar acima da entrada. Isso explica o deslocamento descrito; sem logs/estado autenticados não é possível afirmar que uma compra específica deveria ter sido enviada, pois outros bloqueios de execução também podem existir. SMA 9/21 são médias móveis e continuam variando normalmente; não devem ser confundidas com os pontos marcados.

Exemplo reproduzido: entrada escolhida em US$ 68.000 com BNB a US$ 700. Com ativo a US$ 64.000 e BNB a US$ 550, a regra anterior ainda não compra pelo limite nativo; a regra com âncora USD identifica o cruzamento dos US$ 68.000.

## Correção

- Planos gráficos v2 podem salvar `priceAnchor: { unit: "USD", bnbUsd: ... }` dentro de `chartRule`. Os campos BNB guardam a base da revisão; o preço USD fixo é o nível salvo multiplicado pela referência salva, nunca pelo câmbio atual.
- Novos pontos do editor capturam uma referência, mantêm entradas/saídas/stop marcados estáveis em USD durante atualizações de mercado e preservam a referência no rascunho. Salvar/reabrir mantém os mesmos preços em dólares.
- A decisão pura compara a cotação USD atual do mercado com esses pontos fixos. A visualização utiliza exatamente a mesma referência. Não depende de SMA, da cotação laranja do navegador nem de uma vela histórica para disparar o ponto.
- Capital, alocação por entrada, reserva de gás, custos efetivos, limites e memória continuam em BNB. Os guardas de custo/projeção recebem equivalentes BNB recalculados pela cotação atual, sem modificar a configuração salva nem recalcular os alvos USD.
- Contratos antigos continuam funcionando em BNB. Uma regra já ancorada em USD não pode perder a âncora por uma gravação de cliente antigo: o servidor exige reabrir o editor atualizado.
- Esquema valida âncoras positivas/finitas, pontos resultantes finitos e versão 2. Guardas de liquidez, saldo, slippage, gás, confirmação, estado/versão, entrada já utilizada, stop e mutex permanecem.

## Regra que já estava em execução

Não foram alterados bots reais, posições, ordens ou regras salvas em produção. Os preços USD originalmente escolhidos não constam no contrato antigo, então não é seguro reconstruí-los pelo preço atual ou pela captura de tela.

Após publicar, o editor de uma regra antiga oferece **“Fixar os preços exibidos em US$ neste rascunho”**. O titular deve conferir/digitar os preços que realmente deseja, revisar e confirmar o salvamento/substituição pelo fluxo existente. Esse botão apenas modifica o rascunho. Não corrige automaticamente um alvo original perdido, não pausa/inicia por si só e não vende ativos. Uma substituição continua exigindo confirmação e salva pausado.

Reais/euros são equivalentes cambiais dos pontos USD; podem variar com USD/BRL ou USD/EUR. O valor do capital em reais também pode variar porque o saldo continua em BNB. Isso não muda o preço USD escolhido para a entrada.

## Validação isolada

- Testes reproduzem queda conjunta de BNB/ativo, cruzamento exato da entrada, segunda entrada, saídas/stop fixos, progresso sem recompra, alocações constantes, proteção de custos nativos, configurações antigas e rejeição de âncora inválida.
- Testes do editor verificam estabilidade do campo USD durante mudança da cotação, payload persistido, conversão explícita de rascunho antigo e ausência de início automático.
- Teste do servidor com gateway simulado confirma decisão e valor exato da entrada e base de custos atualizada. Nenhuma transação real é assinada.
- Teste de `RobotVision` confere os níveis realmente passados ao gráfico antes e depois da queda.
- Navegador usa `CandleChart` e o mesmo resolvedor de preços, com dados fictícios, para conferir alvos imóveis em 360/390 px, altura reduzida, paisagem e desktop.
- TypeScript, build offline e lint verificados; sem migração de banco, publicação ou chamada financeira real.

## Publicação

Merge GitHub e publicação são etapas distintas. Depois de publicar, a regra antiga do titular ainda precisa de revisão explícita dos preços desejados. A simulação valida a correção lógica, não confirma a compra que deixou de ocorrer em uma conta real.

Resultado final local: **596 testes offline em 136 arquivos e 80 cenários Chromium aprovados**. TypeScript e build aprovados; lint sem erros, com os 12 avisos anteriores. Nenhum teste iniciou um bot real ou enviou transação.
