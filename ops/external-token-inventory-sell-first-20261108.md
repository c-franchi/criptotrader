# Pré-configuração de venda inicial de tokens transferidos (08/11/2026)

## Cenário
Usuário envia GTE (ou outro ERC-20 da BSC) para a carteira automática e quer escolher **vender primeiro** (sem realizar compra anterior pelo bot), para então:
1. Encerrar após uma única venda (**somente vender**), ou
2. Depois da confirmação e conciliação, revisar a estratégia normal de compra/venda (**vender e continuar**).

O executor atual `strategyBot.server.ts` calcula a quantidade vendável a partir de `strat_state.tokensRaw/tokens` e do saldo no contrato; por isso uma transferência externa para o endereço não se transforma automaticamente em posição. **Não ajustar falsamente** `strat_state.tokens`, `costBnb`, preço médio ou `tokensRaw` ao receber depósitos.

## Entregue neste PR — SEM execução financeira
- Na tela **Meus robôs**, para a carteira automática selecionada, painel **Ativos e venda inicial** com endereço e saldos on-chain BNB e tokens conhecidos.
- Cada token positivo identificado por consulta RPC de `balanceOf` pode ser selecionado no mesmo escopo.
- Criação de rascunho de intenção com percentual (25/50/75/100%), preço mínimo escolhido em BNB/token, ação seguinte (`sell_only` ou `sell_then_review`). Salvo **somente no localStorage** deste navegador, sem API de execução, sem migrar dados e sem alterar o banco.
- Rascunhos vinculados a usuário, carteira, endereço e token; um saldo alterado invalida a prévia. Não salva se o robô está armado ou possui posição registrada.
- Sem custo atribuído a depósitos externos, P&L permanece **indeterminado**; não transforma estimativa em receita efetivamente recebida.

## Fase de execução automática ainda pendente, NÃO incluir por engano nesta publicação
A automação requer revisão independente do banco e do executor antes de inserir um novo tipo de posição:
- Backup comprovadamente restaurável e cópia segura/independente de `BOT_KEY_SECRET` — essa chave criptografa as carteiras automáticas.
- Identificar transferências ERC-20 confirmadas na BSC para o endereço, por `Transfer` logs/índices estáveis por bloco+hash+log, distinguindo depósito e saldo reservado/posição já contabilizada; eventos reorg e depósitos novos devem invalidar planos não confirmados.
- Registrar inventário externo separado (custódia no mesmo wallet, custo não informado, sem ganho/perda inferido) e reserva precisa, com idempotência por `wallet_scope/token`. Reconciliar qualquer venda GTE pendente e provar entrada nativa BNB com rastros compatíveis antes de caracterizar receita líquida.
- Validar vendedor via saldo on-chain e token decimals em leitura fresca, `minOut` por pool real, imposto/taxas de venda, gas, impacto e liquidez; bloquear se saldo insuficiente, transferência recente não confirmada, locks ou `execution_submissions` pendentes; adquirir mutex persistente por carteira e revalidar tudo atomicamente antes de assinar.
- `sell_only` deve ser **one-shot**, no máximo uma venda/ordem pendente, com parada pós-confirmação; jamais repetir vendas em tick subsequente.
- `sell_then_review`: após venda confirmada e reconciliada, voltar ao modo pausado de compras/vendas e exigir autorização explícita. Não iniciar outro ciclo automaticamente sem política e evidência de capital.
- Testes de DB isolados, migração aditiva, simulação sem fundos, duas chamadas concorrentes, reorg, saldo negativo, token sem metadata, taxas diferentes, ordens pendentes, falha RPC, rollback. **Nenhuma dessas etapas foi implementada por este PR**.

## Limite da descoberta de tokens
Leitura RPC pública de BSC **não lista todos os contratos de token** em um endereço. O painel consulta os tokens padrão, cadastrados pelo usuário ou registrados por robôs; para um token novo, cadastrar o contrato ERC-20 via interface para ser monitorado. Nenhum saldo não consultado é exibido como zero.

## Checklist de aceitação visual
- Selecionar Carteira maior/GTE, conferir endereço e saldo; trocar de carteira não usa o rascunho de outra.
- Saldo de GTE desconhecido/zero impossibilita guardar plano.
- Opção somente vender x vender e revisar estratégia seguinte, preço em BNB/GTE, percentual e quantidade estimada.
- Com bot armado ou posição registrada, salvar bloqueado e sem ativação.
- Com alteração de saldo, plano local alerta desatualização. Nenhum efeito em compras, vendas, aprovações, gas ou assinaturas.
