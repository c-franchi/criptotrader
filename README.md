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
