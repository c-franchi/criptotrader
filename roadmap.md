# Correção da seleção e do mercado
## Painel inspirado nos modelos (25/10/2026)
- [ ] Organizar dados do token à esquerda e gráfico compacto à direita no computador; empilhar no celular e preservar fundos existentes.
- [ ] Conferir navegação, gráfico e tamanhos no computador/celular, executar testes e solicitar publicação após verificação de segurança.

## Melhorias pontuais e auditoria (16/10/2026)
- [x] Gráfico compartilhado OHLCV, períodos visuais persistentes, SMA e marcadores identificados como reconstruídos; auditoria consultada atualiza timestamps pelo receipt.
- [x] Auditoria read-only de receipts/eventos/gás e observações append-only das decisões; históricos e posições não reescritos.
- [x] Motor candidato exclusivamente simulado: recuperação, rearme, orçamento, custos, saídas e regimes confirmados; sem presets novos.
- [x] Comparação sem recompra/uma recompra com mesmo orçamento máximo; relatório com 36 testes passando e limitações.
- [x] Fluxo público de Métricas com OHLCV real, abertura da comparação e preferência 15m persistente; sem erros de execução.
- [ ] Verificar auditoria e gráfico do robô com sessão autenticada — mint da conta solicitante indisponível; requer login na prévia.
- [ ] Conciliar BNB nativo recebido no ciclo e aprovações antigas — exige trace isolado/serviço de archive; saídas do router não confirmam receita da carteira.
- [ ] Trocar contabilidade e regras live — deliberadamente desativado para preservar posições abertas; depende de comparação e ativação explícita do usuário.
- [x] Mutex persistente por carteira nos ticks e saques, confirmação pendente não vira falha, alterações concorrentes bloqueadas; mutex retido em resultado indeterminado exige conciliação, sem expiração automática.
- [x] Adicionar opção de stop por perda líquida às estratégias, gráficos e simulação, preservando estratégias existentes; 29 testes passaram, sem enviar transações.
- [ ] Verificar salvamento do stop líquido na conta do usuário — sessão indisponível; requer entrada na prévia, sem alterar robôs ativos automaticamente.
- [x] Estabilizar histórico e gráfico; consultar preço a cada 15s e histórico a cada minuto, mantendo dados nas falhas. Testado logado em celular/computador; seis testes passaram.
- [x] Compartilhar o token selecionado entre Painel, Operar e Grade.
- [x] Distinguir fonte indisponível de ausência de pool e consultar PancakeSwap diretamente como alternativa.
- [x] Testar seleção, navegação, recarregamento e consulta real no Painel; quatro testes passaram.
- [x] Tokens da carteira: buscar saldo (tokens comuns) e adicionar qualquer token pelo endereço, em Painel, Estratégia, Operar e Grade.
- [x] Estratégia: seleção do estilo visível (selo "Em uso", borda dourada, botão "Selecionada", aviso de ajustes manuais) e persistente após salvar e recarregar; testado logado em neifranchi@gmail.com.
- [ ] Verificar Operar e Grade com sessão autenticada — falta um swap real de valor mínimo; nenhuma transação enviada.
- [ ] Simulação continua só com GTE (contas simuladas não são por token).

## Revisão de confiabilidade e experiência (21/10/2026)

- [x] Priorizar saídas de proteção antes dos limites de novas entradas.
- [x] Diário persistente antes da transmissão para swaps, aprovações e saques; confirmação e estado atômicos e idempotentes.
- [x] Impedir liberação de trava por prazo/idade; preservar submissões sem evidência conclusiva.
- [x] Conciliar confirmações manuais tardias e distinguir contabilidade estimada de evidência de receipt/trace.
- [x] Restringir análise/executor ao mesmo pool V2 WBNB e pausar compras com histórico antigo ou incompleto.
- [x] Validar parâmetros, gás e taxas; capital por robô, reservas e teto de uma parcela por tick de grade.
- [x] Versionar rearme e saídas parciais, preservando ciclos existentes.
- [x] Separar simulações por token, salvar fill/saldo atomicamente e preservar histórico legado somente leitura.
- [x] Salvar estratégia com revisão e carteira compartilhada em uma transação.
- [x] Proteger campos operacionais, evidência financeira e idade de carteiras de saque no banco.
- [x] Deduplicar transições de alertas atomicamente e usar fila persistente de notificações.
- [x] Menu desktop/mobile, gráfico no painel, precisão adaptativa, login/recuperação e saúde real de integrações.
- [x] Acrescentar queda máxima, exposição, ciclos e referência comprar/manter às comparações simuladas.
- [x] Declarar decimal.js diretamente, fixar cliente Supabase e adicionar verificações no GitHub Actions.
- [ ] Validar compras, vendas e saques reais pelo titular: não executados durante desenvolvimento.
- [ ] Confirmar recuperação de senha com recebimento de e-mail e entrega push no dispositivo do titular.
- [ ] Histórico de longo prazo e USD/BNB histórico: fonte atual continua limitada; não apresentar a aproximação como resultado comprovado.

## Recuperação real e diagnóstico do executor (22/10/2026)
- [x] Implementar recuperação no caminho real de assinatura, com habilitação e parâmetros explícitos na estratégia.
- [x] Usar velas completas e contínuas; impedir entrada tardia, recompra com posição aberta e repetição no mesmo fundo confirmado.
- [x] Classificar faixa lateral ampla no novo modo, preservando regras de ciclos antigos.
- [x] Compartilhar a observação da estratégia entre servidor e interface e expor avaliação antiga/bloqueada.
- [x] Retornar bloqueios, falhas e adiamentos no cron em vez de sucesso incondicional.
- [ ] Conciliar trava legada identificada em 21/10 às 14:30 UTC: diário atual sem hash associado. Não foi excluída automaticamente.
- [ ] Titular revisar parâmetros, salvar recuperação real e validar uma operação autorizada após conciliação.
