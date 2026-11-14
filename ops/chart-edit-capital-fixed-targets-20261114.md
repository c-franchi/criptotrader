# Edição da atividade e publicação dos preços fixos — 14/11/2026

## Evidências e limite do diagnóstico

Nas capturas das 20:19–20:21, a entrada 1 muda de US$ 62.494,72 para US$ 62.578,31, e as demais linhas mudam em proporção semelhante. Isso é compatível com a conversão BNB/token antiga. A PR #69 já adicionou uma referência salva para que os preços do gráfico e do executor permaneçam fixos em USD. Ela não migra atividades reais antigas nem publica o aplicativo.

Inspeção HTTP pública, sem autenticação, de `https://criptotrader.lovable.app` nesta revisão: o HTML aponta para `index-CuWKvu6i.js`; o gráfico do robô usa `grade-C0nEVBs0.js` e `autoStrategy-OOOQMmbw.js`. O último arquivo servido não contém `priceAnchor`, presente na decisão atual do repositório. O caminho de publicação público inspecionado, portanto, ainda não contém a correção de referência da PR #69. Isso não identifica a configuração privada da conta nem prova a causa de uma compra específica não enviada. Não foram chamados endpoints de robôs/execução em produção.

## Correções adicionais

- O launcher identifica a regra gráfica existente como **Editar atividade e preços** e abre **Editar atividade**, com o fluxo **Revisar valor e entradas**. Abrir o editor só faz leituras.
- O editor carrega o capital configurado (soma exata das entradas e reservas de gás), quantidades, preços de entrada/saída e stop da estratégia salva. Antes o stop não era restaurado e as estimativas de gás atuais podiam redistribuir o orçamento carregado.
- Rascunhos de criação e edição usam chaves distintas por usuário/carteira/token. A edição abre a configuração real, preserva o rascunho anterior sem sobrescrevê-lo só por abrir e oferece recuperação explícita. Confirmações e autorizações não são restauradas.
- `chartEditAvailable` calcula, em wei, o BNB líquido reutilizável pela edição: saldo menos gás e reservas de **outros** robôs. Não adiciona custo já investido em tokens. A conta continua correta quando as reservas totais excedem o saldo líquido.
- `getWalletCapital` expõe `editAvailable` separadamente de `free`, com token validado e o mesmo usuário/escopo autenticados. A consulta é isolada por token no cache do editor. O servidor recalcula o mesmo limite ao salvar.
- O salvamento continua usando exclusivamente as RPCs atômicas existentes, com versão/revisão, confirmação de substituição e travas de execução. Reutilizar a reserva própria não autoriza gastar reservas alheias ou substituir uma operação pendente.
- O formulário prende a versão/revisão que carregou. Atualização em outra janela bloqueia salvar o formulário antigo em cima da versão mais recente e conserva a versão correta no rascunho.
- Saídas sugeridas são fixadas quando apresentadas na etapa de saídas. Atualizações de mercado e mudanças de porcentagem não as recalculam; apenas **Aplicar sugestão às saídas** ou editar um preço pode substituí-las.
- Novas gravações pelo endpoint v2 exigem `priceAnchor`. Um cliente antigo sem referência não pode criar outra atividade v2 com alvos móveis. Regras antigas continuam legíveis; precisam de revisão e conversão explícita no rascunho.

## O que continua exigindo ação do titular

Publicar o frontend e servidor atualizados no Lovable é uma etapa separada do merge. Depois disso, reabrir a página atualizada. Para regra antiga, abrir **Editar atividade e preços**, conferir os preços realmente desejados e escolher **Fixar os preços exibidos em US$ neste rascunho** antes de continuar. Os preços USD originais não foram registrados pelo contrato antigo; não é correto inventá-los ou alterá-los automaticamente.

A moeda do gráfico é USD. Entradas/saídas/stop fixados nessa moeda não acompanham a cotação do BNB ou do token; valores apresentados como equivalentes em reais/euros e o capital em BNB podem variar com o câmbio. Isso não recalcula o alvo salvo em USD. O preço de execução real continua sujeito a cotação, liquidez, taxas, limites e condições da rede; um alvo não garante execução exatamente no preço marcado.

Editar uma atividade já armada/com posição continua passando pela confirmação explícita de substituição existente. Tokens/custo anteriores não são somados ao BNB disponível nem incorporados silenciosamente ao novo plano. Não foi implementada edição de uma posição aberta que descarte seu progresso ou contabilidade.

## Testes isolados

Regressões cobrem atividade de R$ 26 carregando R$ 26 apesar de saldo livre de R$ 5, preservação de duas entradas/saída/stop no payload, reserva própria e alheia, excesso de reservas, autorização de escopo, cliente antigo, rascunho de criação ignorado na edição, recuperação explícita de edição, abertura sem criar/iniciar, saídas imutáveis até pedido explícito e versão alterada em outra janela. A suíte anterior continua cobrindo preços fixos no gráfico e no executor durante queda conjunta.

Nenhum teste negociou, iniciou/pausou/substituiu robôs reais, alterou banco, apagou dados externos ou publicou no Lovable. Não foi acionada a IA do Lovable.

Validação local: **607 testes offline em 137 arquivos**, TypeScript e build aprovados. Lint sem erros, com os 12 avisos anteriores. A primeira execução Chromium não iniciou por ausência do executável no cache do ambiente; o navegador oficial foi reinstalado para repetir a suíte.

Reexecução Chromium aprovada: **80 cenários** em 360×800, 390×844, 390×420, 844×390 e 1280×900. As capturas e os dados são isolados; o fluxo autenticado da carteira real não foi exercitado.
