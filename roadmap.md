# Correção da seleção e do mercado
- [ ] Estabilizar histórico e gráfico; atualizar preço a cada 15s com horário e indicação de falha.
- [x] Compartilhar o token selecionado entre Painel, Operar e Grade.
- [x] Distinguir fonte indisponível de ausência de pool e consultar PancakeSwap diretamente como alternativa.
- [x] Testar seleção, navegação, recarregamento e consulta real no Painel; quatro testes passaram.
- [x] Tokens da carteira: buscar saldo (tokens comuns) e adicionar qualquer token pelo endereço, em Painel, Estratégia, Operar e Grade.
- [x] Estratégia: seleção do estilo visível (selo "Em uso", borda dourada, botão "Selecionada", aviso de ajustes manuais) e persistente após salvar e recarregar; testado logado em neifranchi@gmail.com.
- [ ] Verificar Operar e Grade com sessão autenticada — falta um swap real de valor mínimo; nenhuma transação enviada.
- [ ] Simulação continua só com GTE (contas simuladas não são por token).
