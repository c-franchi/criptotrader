# Clareza, etapas e substituição da atividade gráfica

## Comportamento

- A confirmação mostra “Preço de compra do GTE” (ou venda/proteção) e a cotação em destaque, sem “por GTE”. Uma legenda diferencia cotação e total investido. Cotações pequenas preservam até dez algarismos significativos na exibição; os valores de execução não são arredondados por essa formatação.
- O resumo distingue preço médio de compra, preço estimado para cobrir custos e resultado total estimado.
- Avançar/voltar uma etapa ou concluir o salvamento reposiciona o modal no topo e dá foco à nova etapa.
- Um bot pausado/removido com memória de posição não impede revisar um plano. Ao salvar, é oferecida uma confirmação específica de substituição, com aceite sobre os tokens anteriores.
- A substituição pausa a atividade anterior, preserva uma cópia completa do bot/configuração em `audit_log` e registra a posição antiga separadamente na memória. Não vende, transfere nem zera saldo on-chain.
- A nova atividade gerencia somente as novas compras. Os tokens antigos ficam fora das regras automáticas antigas e novas; isso é explicado na confirmação.
- O resultado da atividade atual começa em uma nova data, sem misturar compras antigas com o novo ciclo. O histórico de operações anterior permanece registrado.
- Usuário/carteira/token/ID, versão, revisão do rascunho, timestamp e memória efetiva do bot são conferidos. Mudança de fill mesmo sem mudança de timestamp exige nova revisão.
- Mutex de carteira, submissão sem confirmação e ordem legada enviada continuam impedindo substituição. Não há liberação de trava, cancelamento de transação transmitida, venda ou início automático.
- Os contadores diários de operações e perda são preservados. Falha em qualquer guarda reverte toda a tentativa, inclusive pausa, memória e auditoria.

## Instalação no banco: necessária para ativar a substituição

O script aditivo `ops/replace-chart-plan.sql` cria apenas a função privilegiada `public.replace_chart_plan`. Não executa a substituição de nenhum bot e não modifica linhas existentes durante a instalação. Ele utiliza a função já existente `configure_guided_bot` e mantém os gatilhos atuais.

A instalação foi concluída no banco do projeto CryptoBot nesta correção. O erro confirmado antes da instalação foi HTTP 404 / `PGRST202`; o catálogo PostgreSQL e os metadados PostgREST não continham a função. A função `configure_guided_bot` existente, as tabelas, os gatilhos e os privilégios de `service_role` foram conferidos antes da aplicação.

No projeto correto do Lovable, solicitar:

> Aplique somente o arquivo ops/replace-chart-plan.sql do repositório sincronizado no banco deste CryptoBot. Primeiro confira que public.configure_guided_bot(uuid,uuid,text,jsonb,integer,integer,jsonb) e as tabelas referenciadas existem. Não execute replace_chart_plan, não altere bots/saldos/posições e não inicie robôs. Não rode outras migrações históricas. Depois confira a assinatura e as permissões da nova função com SELECT.

Verificação de metadados após a instalação:

```sql
select p.oid::regprocedure::text as signature,
       p.prosecdef as security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='replace_chart_plan';
```

Esperado: uma assinatura com 11 parâmetros, `security_definer=false`, `anon_execute=false`, `authenticated_execute=false`, `service_execute=true`. Sem a função, o servidor devolve indisponibilidade e preserva a atividade/rascunho; não tenta uma gravação alternativa.

Aplicado: `drizzle/migrations/0025_install_replace_chart_plan.sql`, com o conteúdo de `ops/replace-chart-plan.sql` preservado, exceto `BEGIN`/`COMMIT` externos administrados pela ferramenta. Nenhuma migração histórica foi reaplicada. O script inclui a atualização do cache PostgREST. Após a instalação, PostgreSQL confirmou uma assinatura de 11 parâmetros, SECURITY INVOKER e execução exclusivamente para `service_role` entre os papéis da aplicação; os metadados HTTP confirmaram os mesmos 11 nomes e tipos enviados pelo servidor. Nenhuma substituição real foi executada para verificar isso.

## Validação

- Testes de interface cobrem cotação claramente identificada, confirmação/cancelamento sem início automático e payload de substituição com estado anterior.
- A função SQL é executada em Postgres isolado (PGlite), junto das funções/guardas históricas relevantes. Os testes verificam bot removido com posição, snapshot completo, pausa, contadores, rollback, bloqueio por mutex/submissão/ordem enviada, versão/revisão/estado divergente, proprietário/carteira incorretos e negação de execução a anon/authenticated.
- O teste de navegador usa o hook real de navegação para conferir que avançar pelo rodapé termina no topo. A confirmação real de substituição é exercitada com dados fictícios e sem conexão financeira.
- As verificações não equivalem a substituir uma posição real em produção. Essa decisão fica para o usuário na confirmação da aplicação, após a instalação da função.

Resultados desta correção:

- 50 testes específicos aprovados, incluindo 16 testes PostgreSQL/PGlite e 15 testes da ferramenta gráfica com servidor simulado. Cobrem ativo/pausado/removido, retenção da posição e histórico, limites diários, usuário/carteira/token, estado concorrente, mutex, submissões, cancelamento, novo plano pausado e rollback de falha tardia inclusive rascunho/estratégia/auditoria.
- Confirmação real exercitada com Playwright Python e dados fictícios em 360×800, 390×844 e 390×420: cancelamento sem salvamento, aceite obrigatório, rolagem, foco contido/restaurado e salvamento fictício pausado; sem erros de página. O runner JS não encontrou sua versão do Chromium, por isso foi usado o navegador pré-instalado do Python.
- Compilação automática: `build OK`. Lint dos arquivos modificados: aprovado. Lint global: 909 erros de formatação em arquivos gerados de integração e 12 avisos anteriores; esses arquivos protegidos não foram alterados manualmente. TypeScript não foi executado separadamente; a compilação automática não substitui esse resultado.
- Suíte completa: 538/541 testes passaram; três falhas fora deste fluxo (histórico e câmbio). Reexecução desses dois arquivos: câmbio passou, duas falhas de histórico persistiram. Não foram feitas mudanças fora do escopo.
- Em produção foram confirmados somente instalação, compatibilidade e disponibilidade por metadados. Não houve substituição, pausa, remoção, início, operação financeira nem publicação. O fluxo autenticado real com salvamento permanece deliberadamente não exercitado, conforme a proibição de substituição real para teste.
