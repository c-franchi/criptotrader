# Criptotrader

Aplicação de acompanhamento e negociação de tokens da BNB Smart Chain. Inclui mercado e gráficos OHLCV, estratégias por token, simulação, operação assinada na carteira e robô com carteira dedicada.

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

## Regras e simulação

- Limites de entrada não impedem avaliação de stop, trailing ou take-profit. Liquidez, gás e capacidade de execução ainda podem impedir uma venda.
- Análise e execução automatizada usam o mesmo pool token/WBNB PancakeSwap V2. Outros pools são apresentados como consulta.
- Compras exigem histórico recente e contínuo e taxas conhecidas ou confirmadas pelo usuário.
- Estratégias sem `rulesVersion` preservam o comportamento legado. A versão 2 adiciona rearme das entradas por médias e respeita o percentual de todos os alvos. Uma posição aberta impede alteração da configuração do ciclo.
- Regras candidatas em `candidateStrategy.ts` e custos normalizados em `costLedger.ts` são exclusivamente simulados e nunca importados pelo executor.
- Simulações novas são por token; saldo e histórico são gravados atomicamente, com revisão e identificador idempotente. Simulações antigas sem token são somente leitura.
- Comparações incluem resultado de liquidação, queda máxima, exposição, ciclos e comprar/manter com custos equivalentes. Cerca de 25h de dados não comprovam desempenho de uma estratégia.

## Operação

O cron do robô usa `/api/public/hooks/grid-tick` com autenticação. O cron de alertas usa `/api/public/hooks/alert-tick`. O diário de notificações preserva avisos durante falhas temporárias de push, com limite de tentativas e identificação para agrupamento no aparelho. A entrega externa não tem garantia de exatamente uma vez.

A tela Integrações consulta o estado real do banco, RPC, configuração e verificação dos robôs. Ela não mostra segredos. Recuperação de senha depende do envio de e-mail e das URLs de redirecionamento autorizadas no provedor de autenticação.
