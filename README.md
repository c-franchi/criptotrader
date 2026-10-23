# Criptotrader

Aplicação de acompanhamento e negociação de tokens da BNB Smart Chain. Inclui mercado e gráficos OHLCV, estratégias por token, operação assinada na carteira e robô com carteira dedicada.

- Site: https://criptotrader.lovable.app
- Editor: https://lovable.dev/projects/813e2308-d3b8-4ddb-acec-44b1593415e4
- Stack: React 19, TanStack Start, TypeScript, Supabase/Postgres, viem e PancakeSwap V2.

## Desenvolvimento e validação

Use Bun 1.3.3 e o lockfile versionado:

```sh
bun install --frozen-lockfile
bun run dev
bun run typecheck
bun run lint
bun run test
bun run build
```

As verificações também rodam no GitHub Actions em pull requests e na branch `main`. Os avisos do lint relativos a Fast Refresh e alguns hooks preexistentes não são erros de compilação.

## Publicação

Commits em `main` sincronizam com o projeto Lovable conectado. Sincronização não equivale a publicação do site público. Verifique a prévia e publique a versão pelo fluxo de publicação do Lovable. Não reescreva o histórico publicado.

As migrações ficam em `drizzle/migrations` e seu registro em `meta/_journal.json`. Antes de publicar esta versão, aplique `0014_execution_and_simulation_safety.sql` ao banco conectado, de forma transacional. O arquivo é uma migração única, não um script para rodar repetidamente. Ela não atribui ativos a contas simuladas antigas, não apaga históricos e não muda os parâmetros das estratégias já salvas.

`tests/database-safety.sql` valida isolamento, idempotência de fills e confirmações, revisão de saldo e deduplicação de alertas. Execute somente dentro de uma transação com `ROLLBACK`; os registros do teste não devem persistir. A integração de banco usa segredos do servidor e jamais deve ser testada assinando operações reais.

## Execução e reconciliação

Cada caminho de assinatura do robô (aprovação, swap ou saque) precisa da trava persistente da carteira. A transação é assinada localmente e o hash/nonce/intenção são persistidos antes da transmissão. A transação assinada e a chave privada não entram no diário. Receipts imediatos e tardios passam pela mesma confirmação atômica no banco, que aplica a posição apenas uma vez.

Prazo do swap, timeout e idade da trava não provam falha. Enquanto uma submissão não puder ser conciliada, a carteira permanece bloqueada. Submissões legadas sem evidência suficiente exigem revisão; não há liberação automática por tempo. Não apague travas nem reenvie ordens para "destravar" sem examinar a rede.

Gás e transferências de tokens vêm do receipt. BNB nativo recebido só é classificado como confirmado com trace da transação, que depende de um RPC com suporte a `debug_traceTransaction`. Sem isso, o resultado continua explicitamente estimado. A contabilidade legada de ciclos existentes não é reescrita.

## Regras de execução

- Limites de entrada não impedem avaliação de stop, trailing ou take-profit. Liquidez, gás e capacidade de execução ainda podem impedir uma venda.
- Análise e execução automatizada usam o mesmo pool token/WBNB PancakeSwap V2. Outros pools são apresentados como consulta.
- Compras exigem histórico recente e contínuo e taxas conhecidas ou confirmadas pelo usuário.
- Estratégias sem `rulesVersion` preservam o comportamento legado. A versão 2 adiciona rearme das entradas por médias e respeita o percentual de todos os alvos. Uma posição aberta impede alteração da configuração do ciclo.

## Operação

O cron do robô usa `/api/public/hooks/grid-tick` com autenticação. O cron de alertas usa `/api/public/hooks/alert-tick`. O diário de notificações preserva avisos durante falhas temporárias de push, com limite de tentativas e identificação para agrupamento no aparelho. A entrega externa não tem garantia de exatamente uma vez.

A tela Integrações consulta o estado real do banco, RPC, configuração e verificação dos robôs. Ela não mostra segredos. Recuperação de senha depende do envio de e-mail e das URLs de redirecionamento autorizadas no provedor de autenticação.

## Recuperação no executor real (22/10/2026)

A estratégia adaptativa oferece **Comprar recuperação no robô REAL**, habilitado e parametrizado pelo titular em Estratégia. Não ativa automaticamente configurações salvas, não altera posições abertas. A nova entrada substitui entradas adaptativas antigas enquanto habilitada: queda entre topo anterior e mínima de fechamentos, recuperação limitada e fechamentos consecutivos em alta. Usa apenas o final contínuo de velas completas e recentes, bloqueia compras tardias, não faz recompra com posição aberta e consome o fundo somente após fill confirmado. Uma venda não apaga o fundo consumido.

Os valores iniciais do formulário (8% de queda, recuperação entre 2% e 8%, dois fechamentos) são exemplos editáveis, não parâmetros otimizados nem garantia de lucro. O espaço até o topo anterior precisa superar a meta adaptativa estimada com taxas do token, slippage configurado nas duas pontas e taxas DEX estimadas. Isso não prevê retorno ao topo e não confirma lucro após gás ou execução real. Todos os controles de capital, liquidez, taxas verificadas, gás, impacto, cooldown e trava continuam ativos.

`grid-tick` retorna contagens de tentativas, avaliações sem erro, bloqueios, falhas e adiamentos; bloqueios/falhas respondem HTTP 503. Não registrar uma passagem pela estratégia como se tivesse ocorrido quando a trava impediu a execução. A tela diferencia a consulta de análise do servidor, o preço ao vivo e o horário do executor.

Travas antigas sem hash no diário atual exigem conciliação individual com registros históricos e rede. Nunca excluir por tempo, saldo aparentemente intacto ou ausência de linhas no diário. O cron pode estar funcionando normalmente enquanto uma carteira permanece bloqueada.

## Salvamento com execução bloqueada (22/10/2026)

A migração `0015_strategy_drafts.sql` cria rascunhos privados por usuário e token. O servidor tenta aplicar com as proteções e revisão existentes; em bloqueio de execução, posição aberta ou conflito da versão real, preserva os campos em rascunho e retorna explicitamente `draft`. A versão real não avança, o executor não lê rascunhos e nenhuma trava é removida. Rascunhos usam revisão independente para impedir sobrescrita entre abas. A aplicação válida e o consumo do rascunho são atômicos; não há aplicação automática após desbloqueio.

A interface recupera o rascunho ao abrir, distingue sua versão da versão real, evita envios duplicados e não oferece primeira compra após salvar apenas um rascunho. `tests/strategy-drafts.sql` deve ser executado dentro de transação com `ROLLBACK`; usa somente fixtures com usuários aleatórios.

## Recursos de simulação removidos (22/10/2026)

Foram removidos a rota de simulação, seus endpoints de escrita, motores de replay e comparações hipotéticas. Métricas mantém estatísticas e gráficos de mercado. As migrações históricas e os registros antigos no banco são preservados; não há conversão de saldos fictícios em saldo real. A validação técnica de contratos antes de assinar operações reais permanece ativa.

A tela Estratégia consulta os bloqueios por carteira e posição do token a cada 15 segundos, informa o motivo do rascunho e orienta a conciliação ou revisão da versão antes de uma nova aplicação explícita. Respostas de salvamento de outra carteira não são aplicadas ao formulário atual.

## Sala do robô, capital e reset (22/10/2026)

A rota `/grade` apresenta os controles de iniciar/pausar ao lado do gráfico, análise, posições e operações; há modo de tela cheia. Os relatórios de saldo são por usuário e carteira, atualizados a cada 15 segundos. Saldo BNB na rede, custo de posições, reservas de compra, gás e saldo livre são separados. Custo de posição já saiu do BNB líquido e não é descontado novamente. Custo legado não é rotulado como resultado confirmado.

`walletCapital.ts` é compartilhado pelo relatório e pelos dois executores (estratégia/grade). Capital individual considera o menor limite positivo entre `allocationBnb` e `maxExposureQuote`, descontando o custo da posição. Sem limite, reserva as entradas fixas restantes, o percentual da próxima compra ou uma ordem da grade. Bots pausados mantêm suas posições e não reservam novas compras. Prévia de início inclui explicitamente o bot selecionado. A compra confere novamente o saldo da rede e as reservas dos outros bots sob a trava da carteira. Reservas acima do saldo geram déficit visível; não são fundos transferidos nem garantia de execução. Vendas continuam seguindo os controles existentes.

`0017_reset_strategy_configuration.sql` adiciona reset transacional, disponível somente ao servidor autenticado. Remove configurações/rascunhos e pausa os bots, arquivando os valores anteriores em `audit_log`. Mantém bots, carteiras, posições, ordens, receipts e locks. Recusa posição aberta ou submissão pendente. Reset não é conciliação de execução e nunca libera mutex. A interface exige confirmação explícita; todas as carteiras são incluídas somente ao marcar essa opção. O executor nunca é ligado automaticamente pelo reset.

`tests/reset-strategies.sql` foi validado em transação com rollback e usuários aleatórios. Verifica isolamento, auditoria, preservação de bots/locks, posição aberta e transação pendente. Os testes de capital verificam reservas concorrentes, percentuais, grade, saldos pequenos e ausência de desconto duplicado.

## Remover bot pausado

A ação Remover robô aparece na sala e na lista de bots quando o bot está pausado, com confirmação por token e carteira. A migração 0018 arquiva a linha para preservar referências de conciliação; o bot sai das telas ativas, do orçamento e do scheduler. A remoção recusa bot ligado, posição aberta ou submissão pendente na carteira, preservando saldo, carteira, estratégia, histórico e mutex. Uma posição recebida tardiamente torna o bot novamente visível e pausado. Criar novamente o mesmo token restaura a linha pela ação explícita de configuração/início e continua sujeito às proteções existentes. Nenhum bot existente é removido pela migração.

### Recuperação de tentativas interrompidas antes do envio

Novas execuções registram a fase `preparing`. A inscrição no diário bloqueia a mesma linha e muda a fase para `submitted` antes de qualquer transmissão. A RPC interna `recover_preflight_execution` recupera apenas preparações interrompidas há mais de 15 minutos, sem qualquer inscrição no diário ou ordem enviada na carteira. Um processo antigo perde a autorização para registrar/transmitir após a recuperação. Transações registradas continuam exigindo conciliação por recibo; travas legadas `unknown` exigem investigação individual, nunca liberação por idade. A recuperação é auditada, ocorre ao salvar estratégias e antes de adquirir a carteira, e pode ser solicitada na tela de aplicação do rascunho. Não inicia robôs nem movimenta saldo.

Os valores efetivos (valor/percentual por compra, número de entradas, capital por robô e exposição) ficam sempre visíveis em **Valores das operações do robô**, inclusive nos modelos prontos. O orçamento do passo 3 serve apenas para gerar um modelo; aplicar um modelo recalcula os valores, que podem ser revisados antes de salvar. Após salvar, o fluxo abre a sala do robô com gráfico e controles, sem iniciar automaticamente.

### Assistente de robôs e verificação de início

Em **Meus robôs**, o assistente reúne modelo → valores → regras → revisão. Os modelos guiados são **Comprar em etapas** (entradas após quedas, saída total pelo preço médio), **Comprar e vender numa faixa** (níveis em BNB por token, com proteção e meta globais da posição) e **Recuperação confirmada** (regra própria existente). A primeira avaliação da faixa apenas registra o nível. A entrada por queda usa a referência suavizada de fechamentos da janela, não prevê o fundo nem compra retroativamente. Valores em reais são convertidos para BNB pela cotação disponível e ficam identificados como estimativas.

A RPC `configure_guided_bot` aplica regras e prepara o bot pausado atomicamente, respeitando versões, revisão de rascunho, carteira, mutex e posição. Não altera bots ligados nem posições abertas. Configurações antigas continuam disponíveis em **Avançado**. Nenhuma configuração existente é migrada ou armada automaticamente.

`startGuidedBot` verifica, no servidor, par compatível, preço recente, confirmação de taxas, liquidez, capital compartilhado, taxa da rede e estimativa de compra. A RPC de início verifica novamente a versão e o estado da carteira sob serialização. Clientes comuns podem pausar, mas não armar diretamente pela tabela. BNB/WBNB é bloqueado na interface, no início e no executor. Interrupções novas geram notificação interna deduplicada pelo motivo anterior. Transações pendentes continuam protegidas pelo diário e mutex.

Custos de troca de ida e volta são estimados com as cotações atuais, taxas do token e preço de saída do router. O custo futuro de gás da venda é desconhecido antes da execução. Margens que já não cobrem os custos conhecidos impedem início; novas compras guiadas conferem novamente a margem e o gás real estimado antes de assinar. Stop por preço é um gatilho, não um teto garantido de perda.

O painel separa operações encerradas, posição aberta estimada, total estimado e gás registrado. Usa apenas operações vinculadas ao `botId` pelo diário e recebimentos nativos confirmados; não transforma quotes em dinheiro recebido, não contabiliza depósitos como lucro e mostra **Não apurado** para dados insuficientes. Histórico legado não atribuível ao robô fica preservado e fora da apuração. O gráfico abre no período da estratégia, converte a faixa de BNB para USD somente com cotação e esconde gatilhos quando a análise do executor está indisponível.
