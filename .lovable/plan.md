# CryptoBot — plano cirúrgico de implantação

## Decisão

**Não autorizar a implantação em produção ainda.** Autorizar somente a resolução documentada dos bloqueios e a homologação isolada. Esta rodada realizou consultas de leitura; não aplicou migrações, não restaurou backups, não publicou, não ativou jobs nem alterou robôs ou dados financeiros. A única entrega escrita é este plano.

## Evidências verificadas em 07/11/2026, aproximadamente 02:18 UTC

| Item | Resultado |
|---|---|
| Código local | `3b9ca21b7d980af5b0208b30716c35d4b1d0d896`, correspondente ao commit informado; árvore sem alterações antes do plano. |
| Git conectado | A ferramenta não expõe a conexão externa. Confirmar em **Project settings → Git**: `c-franchi/criptotrader`, `main`. Ter o commit local não comprova a conexão. |
| Produção | `https://criptotrader.lovable.app` serve marcador de commit `d86220b4607d6897a76406223b69d912563db15c`; `/api/public/app-version` retorna `2026-11-05T23:02:23.182Z`. Portanto, não está publicada a revisão solicitada. O marcador também existe no histórico Git local. |
| Banco | Lovable Cloud responde normalmente; o identificador de banco no código público publicado corresponde à instância esperada deste projeto. `current_database() = postgres` sozinho não seria prova suficiente. Não são divulgadas URLs internas ou credenciais. |
| Recuperação | O usuário confirmou visualmente snapshot de **06/11/2026 09:51:08 UTC**, com opção de restauração. É o ponto informado, não uma consulta independente do inventário nem prova de que seja o mais recente. |
| Histórico Drizzle | 15 registros: `0000`–`0014` correspondem aos hashes SHA-256 e timestamps dos arquivos locais. Último registro: `id=16`, timestamp `1792589366102`, de **21/10/2026 13:29:26.102 UTC**. O `id` não é o número da migração. |
| `0015`–`0021` | Sem registros nos timestamps esperados; objetos correspondentes existem. Os corpos das **20 funções finais** têm MD5 de `prosrc` igual aos corpos locais, considerando sobrescritas posteriores. Colunas, índices e constraints relevantes conferem; triggers e permissões foram consultados. Isso comprova compatibilidade atual, não a origem histórica da aplicação. |
| Histórico nativo | `migration_history inspect`: não encontrou árvore histórica única para reparação segura. Faltam snapshots `0014`, `0022`, `0023` e registros `0015`–`0023`. Nenhuma reparação foi executada. |
| `0022` | As três tabelas do arquivo de velas e as duas funções novas estão ausentes. |
| `0023` | Fila, heartbeat e três funções novos estão ausentes. O delimitador PL/pgSQL foi corrigido para `$$`. |
| Agendamento | `grid-tick` ativo a cada **2 segundos**, preservado; `alert-tick` também ativo. Não há `market-candle-tick` ou `accounting-tick`. Metadados seguros não expõem o destino do job legado `grid-tick`; não foi lido seu comando secreto. |
| GTE histórico | 7 vendas com status de transação `confirmada`: 4 `robo`, 3 `manual`; todas com contabilidade `estimado` e BNB recebido nulo. Todas possuem hash e par. Nenhum lucro foi confirmado nesta rodada. |

## Bloqueios e compatibilidade

### 1. O migrador normal não é seguro neste estado

Versões instaladas: **drizzle-orm 0.45.4** e **drizzle-kit 0.31.11**. O migrador PostgreSQL lê o maior `created_at` e executa todas as entradas do journal com timestamp posterior; registra hash e timestamp após executar SQL. Ele não usa a equivalência do esquema nem valida hashes históricos para decidir o que pular.

Com o estado atual, tentaria executar **0015–0023**, incluindo `CREATE TABLE`, `CREATE FUNCTION` e adições de colunas já existentes. Não chamar a ferramenta de migração enquanto esse risco existir. Snapshots ausentes são uma divergência adicional de metadados, mas não são a única causa do risco.

É necessário um mecanismo **suportado e comprovado** de reconciliação/implantação somente futura. A inspeção nativa atual não oferece plano de repair. Não há, nesta rodada, um procedimento aprovado para inserir registros históricos ou saltar timestamps.

### 2. Ressalva de permissões da 0023

`queue_sale_accounting()` é `SECURITY INVOKER`, enquanto a fila só permite acesso ao `service_role`. Uma atualização autenticada de venda não manual confirmada que dispare o trigger pode falhar ao inserir/atualizar a fila, revertendo a atualização da ordem. Escritas manuais normais com `source=manual` não entram nesse ramo; execução pelo serviço é compatível com os grants.

Antes de aprovar: testar os papéis reais dos escritores em ambiente isolado. Se o caminho autenticado precisar continuar permitido, uma correção deve vir como artefato aprovado do GitHub, com proprietário confiável e `search_path` seguro. Não ampliar acesso direto dos usuários à fila como atalho. Não houve correção de código nesta análise.

### 3. Critério de evidência financeira precisa ser resolvido

O código atual tenta primeiro `proveSaleWithPublicRpc`, que aceita o fluxo de WBNB e a retirada do router com validações de chamada/recibo; pode marcar `accounting_status=confirmado` com fonte `pancake_v2_wbnb_receipt` **antes de obter trace nativo**. Isso diverge da regra do projeto de não apresentar saída do router como resultado nativo confirmado da carteira.

Não ativar a conciliação enquanto esse critério não tiver aprovação explícita ou adequação no GitHub. Para o critério estrito atual, a prova deve ser uma execução completa e bem-sucedida da transação exata, no bloco canônico da BSC, com entradas/saídas nativas da carteira correta verificadas. Quotes, saldo geral, eventos do pool e retirada WBNB isolada não bastam. Ausência de prova permanece pendente, nunca zero ou lucro confirmado.

### 4. Cobertura histórica da 0023

O backfill inclui somente vendas **não manuais**: os dados atuais gerariam 4 entradas GTE, não 7. As 3 manuais ficam fora da fila automática; qualquer requisito de conciliar automaticamente todas as vendas precisa ser decidido antes da ativação, sem alterar as ordens para mudar sua origem.

A 0023 insere registros derivados na fila como parte da criação do esquema; não altera saldos nem valores históricos de ordens. O processamento posterior altera campos contábeis e acrescenta provas, e exige autorização separada. `resolved_at` não é reaberto por `ON CONFLICT DO NOTHING`; testar o contrato de imutabilidade dos campos financeiros.

### 5. Compatibilidade da 0022

Nenhuma incompatibilidade estrutural direta encontrada nos pré-requisitos. Cria arquivo de mercado, sem tocar ordens, carteiras ou travas. Os grants existem para todas as tabelas; o acesso é somente do serviço. `IF NOT EXISTS` não valida estruturas: se objetos surgirem antes da implantação, repetir a comparação completa. Sem mercados cadastrados, o coletor pode funcionar sem gravar velas; isso não comprova recuperação de histórico.

## Ordem segura das operações futuras

### A. Fechar pré-requisitos, ainda sem alterações em produção

1. Confirmar conexão Git/branch pela interface e obter revisão candidata imutável. Se houver correções aprovadas, registrar o novo commit; não afirmar que `3b9ca21` contém essas correções.
2. Reconfirmar que o snapshot informado ainda está disponível e registrar o timestamp UTC mais recente visível. Não restaurar para testar em produção.
3. Antes de mudanças, preservar o estado atual com **More → Database → Manage → Settings → Export data**. O export inclui esquema, dados e usuários com hashes de senha; não inclui storage, segredos ou configuração dos provedores de login. Storage deve ser baixado separadamente em **More → Storage**. Não usar dump por script.
4. Produzir mapeamento de cada entrada histórica: arquivo exato, hash, timestamp, objetos finais, evidência da execução original e eventuais registros de outro mecanismo. Não atribuir números Drizzle a registros de outro sistema por inferência.
5. Obter reconciliação suportada. Se nova inspeção nativa retornar um plano inequívoco, revisar e solicitar aprovação específica antes de repair. Se continuar ambígua, **parar**: não inventar registros/snapshots, não alterar timestamps para pular SQL, não comentar migrações antigas para contornar o problema.
6. Resolver o critério de prova nativa e as permissões condicionais da 0023; documentar cobertura manual versus robô.

### B. Homologar em ambiente isolado

1. Restaurar **o export**, não o snapshot diário, em um projeto separado sob controle do usuário. A tela Backups restaura somente o mesmo banco em produção; remix não copia dados. Esta alternativa exige ambiente e configurações próprios.
2. Isolar credenciais e manter todos os jobs de trading desativados no destino desde sua preparação. Não copiar/ativar `grid-tick` ou executar assinaturas. Não modificar o job de produção.
3. Configurar login e provedores no destino; verificar recuperação do acesso. Não presumir que settings de autenticação vieram no export.
4. Ensaiar o mecanismo aprovado de histórico e aplicação **somente de 0022 e 0023**, separadamente, através do mecanismo estabelecido. Comprovar o conjunto pendente antes de cada aplicação.
5. Rodar testes existentes de SQL, evidência nativa, conciliação e ciclos fechados com provedores simulados; testar papéis/grants/triggers em dados isolados. Repetição não duplica fila; concorrência não duplica contabilização; falha de provedor não confirma lucro.
6. Demonstrar que os registros históricos e estados dos bots/travas não são reescritos. Validar a fila GTE esperada, RLS, grants, índices e funções.

### C. Produção, somente após nova autorização explícita

1. Revalidar identidade, revisão, recuperação e histórico; registrar metadados seguros do `grid-tick` como referência.
2. Aplicar somente a 0022 pelo mecanismo aprovado; verificar todos os objetos e o registro produzido pelo próprio mecanismo.
3. Aplicar somente a 0023 aprovada; verificar objetos, backfill derivado e registro. Comparar SHA-256/timestamp com o artefato realmente executado. Não inserir histórico manualmente nem alterar o journal gerado fora de um procedimento suportado.
4. Publicar a revisão aprovada, sem recriar funcionalidades; verificar versão/commit efetivamente servidos e banco de destino. Testar login e consultas sem chamar execuções de trading.
5. Só então ativar os novos jobs de forma independente: `market-candle-tick` a cada minuto, destino **`/api/public/hooks/candle-tick`**; `accounting-tick` a cada 2 minutos, destino `/api/public/hooks/accounting-tick`. Preservar `grid-tick`, frequência, comando, credencial e identidade.
6. Os scripts de ops derivam comandos do cron legado; a ferramenta atual bloqueia SQL de inspeção/autoria HTTP em `cron`. Usar o mecanismo seguro de agendamentos suportado, validando compatibilidade de autorização, sem imprimir comandos ou tokens. Se não houver mecanismo equivalente confirmado, parar antes de ativar jobs.

## Critérios de aceite

- Histórico reconciliado com evidência; nenhum SQL antigo reaplicado; 0022/0023 registradas exatamente uma vez pelo mecanismo autorizado.
- Objetos finais, constraints, índices, RLS, proprietário e grants conferidos. SQL corrigido e teste de papéis aprovado.
- Produção serve a revisão autorizada, usa o banco correto, login funciona e nenhuma operação de compra/venda/transferência foi enviada durante a validação.
- `grid-tick` permanece inalterado. Comparações financeiras consideram que bots já ativos podem operar independentemente desta auditoria; não atribuir mudanças naturais ao procedimento.
- Com navegador/PWA fechados, observar pelo menos três execuções dos novos jobs e avanço dos heartbeats. Para velas, observar mercado cadastrado por mais de cinco minutos; heartbeat sozinho não comprova velas válidas. Em Integrações, limiares atuais: coletor recente <4 min e contabilidade recente <6 min.
- Conta autorizada vê indicadores reais em Integrações; outra conta não acessa a consulta protegida. Não usar sessão ausente para declarar validação autenticada concluída.
- GTE: mostrar separadamente elegíveis, pendentes e comprovadas; o número confirmado só avança com prova aprovada vinculada a usuário, escopo, carteira, hash e bloco. Contagem de provas no audit_log não basta: conferir a ordem atualizada e o ciclo fechado completo, incluindo custos e gás.

## Interrupção e recuperação

Parar por qualquer divergência de banco, autenticação, revisão, hash, histórico, esquema ou autorização; por tentativa de reexecutar 0015–0021; por teste financeiro que confirme estimativa; por necessidade de alterar robôs/travas; ou por incompatibilidade do agendamento seguro.

Antes da publicação, falha de aplicação deve ser tratada pelo mecanismo transacional e nova inspeção, nunca reset. Após ativação, conter somente os **novos** serviços com autorização específica; preservar `grid-tick`. Preferir correção aditiva aprovada; não remover tabelas/dados.

Restauração é último recurso e requer decisão explícita do usuário: o snapshot de **06/11/2026 09:51:08 UTC** reverte **esquema e dados do mesmo banco**, causa indisponibilidade por alguns minutos e perde permanentemente dados posteriores. Não reverte transações BSC. Exportar antes preserva o estado atual; não torna a restauração reversível. Storage não está no snapshot nem no export. Depois, testar o app contra o esquema restaurado e resolver divergências por nova migração aprovada.

**Status operacional:** a nova conciliação não está instalada nem agendada em produção. O backup informado habilita uma opção de recuperação, mas não elimina os bloqueios de histórico, permissões e evidência financeira.