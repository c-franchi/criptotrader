# Reconciliação Drizzle — implementação e ensaio, 07/11/2026

## Executado, sem alterações em produção
- Revisão inicial local: `f5df3bb07529f0c6fa6cc8a1e140ccba5d09471a`. Não foi confirmada a revisão remota nem realizada publicação.
- Drizzle ORM **0.45.4**, Kit **0.31.11**, PostgreSQL isolado **17.11**.
- Criados `ops/drizzle-reconcile.mjs`, `ops/drizzle-catalog.sql`, `ops/drizzle-rehearsal.mjs` e `tests/accounting-release-isolated.sql`.
- Reconstruído o esquema por execução literal de 0000–0021 **apenas no banco temporário**; ledger preenchido até 0014, usando bytes e timestamps reais.
- Ensaio registrou 0015–0021 sem executar seu SQL novamente; repetição não duplicou registros; seleção restante exatamente 0022 e 0023. Divergência de catálogo/hash e trava ativa abortaram corretamente. Teste de concorrência paralelo ainda não realizado.
- Instaladas 0022 e 0023 separadamente **somente no ensaio**. Testadas leases, heartbeat, escrita de ordens com `authenticated` e `service_role`, rejeição de fila direta e prova financeira forjada, backfill e repetição.
- 20 testes Vitest passaram em quatro arquivos existentes de contabilidade e velas. Build automático observado como `build OK`; não houve execução manual de build/typecheck.

## Correspondência com produção
Consulta somente de metadados comparou **44/44 objetos** (17 tabelas e 27 funções) exatamente, pelo MD5 do JSONB produzido pelo mesmo SQL: colunas/defaults, constraints/validação, índices, triggers/estado, políticas, RLS, ACLs, proprietários e funções/corpos/configuração.

Diferenças iniciais resolvidas **no ensaio**, não ocultadas na comparação:
1. Cloud tem ACLs iniciais adicionais para anon/authenticated/service_role e sandbox_exec. Reproduzidas por default privileges antes de executar os arquivos originais; revogações históricas permaneceram intactas.
2. `pgcrypto` encontra-se em `extensions`, não `public`. A localização foi reproduzida no ensaio; bytes históricos não foram alterados.

A correspondência de estado final demonstra compatibilidade estrutural, não prova quando cada mudança foi executada nem valida retrospectivamente todos os seus efeitos sobre dados. Funções antigas substituídas por migrações posteriores são verificadas pela definição final legítima, não pela definição obsoleta.

## Algoritmo e travas
SHA-256 do SQL UTF-8 exato; `when` legítimo do journal gravado como `created_at`. Esse campo identifica a migração, **não comprova horário real de aplicação**. IDs serial são gerados pelo banco, não copiados nem fabricados.

Drizzle seleciona entradas com `when > max(created_at)`; não usa hashes para detectar drift. Script exige prefixo contínuo com hashes/timestamps exatos, catálogo completo, execução desarmada, transação serializável e locks explícitos. Divergências causam rollback. Não modifica snapshots nem journal.

**Execução de produção propositalmente bloqueada** no código: conexão permitida somente ao banco descartável `cryptobot_rehearsal*`, localhost:55432, também validada dentro da transação. O teste não autoriza ignorar o mecanismo de administração do Cloud.

## Pendências reais, não declaradas concluídas
1. Proprietário gerar exportação atual: **More → Database → Manage → Settings → Export project data → Export data → Database → Export → Start export**. Baixar por link recebido ou Storage; informar horário UTC posterior a 07/11/2026 04:30:38. Exportação inclui auth/password hashes e chaves criptografadas, **não segredos nem arquivos Storage**. Manter arquivo confidencial.
2. Recuperabilidade deve ser testada restaurando a exportação em ambiente independente autorizado e verificando dados/login, sem expor chaves. Reconfigurar provedores e segredos separadamente. Não existe importação self-service nessa tela do Cloud.
3. Recuperação independente de `BOT_KEY_SECRET` segue não comprovada. Não alterar, substituir ou revelar o segredo.
4. Obter execução privilegiada suportada para reconciliação de ledger: a ferramenta de schema aceita DDL, não reparação de registros; ferramenta histórica não fabrica linhas; credenciais privilegiadas não são disponibilizadas. **Não usar DDL disfarçado, função service-role ou endpoint administrativo para contornar esse limite.**
5. Depois dos gates, repetir preflight, executar reconciliação autorizada, aplicar 0022/0023 com ferramenta oficial, conferir objetos/dados e oito robôs desarmados; publicar revisão verificada e só então ativar os dois cron existentes nos arquivos ops. Preservar grid-tick/alert-tick; exigir três execuções reais e persistência sem PWA aberto.

Nenhum backup atualizado foi recebido/verificado, ledger de produção alterado, migração instalada em produção, robô armado, transação assinada, serviço ativado ou código publicado nesta rodada. GTE continua pendente sem trace nativo completo. A PR54 não foi modificada.