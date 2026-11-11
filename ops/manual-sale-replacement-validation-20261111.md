# Substituição e venda manual — 11/11/2026

## Causas e correções

### Substituição

- No banco conectado ao CryptoBot, `replace_chart_plan` já existe, com 11 parâmetros, SECURITY INVOKER e execução permitida a service_role, negada a anon/authenticated. A assinatura e os nomes correspondem aos argumentos de `saveChartPlan`.
- Metadados PostgREST consultados com GET: HTTP 200, função presente no cache com os 11 argumentos. `configure_guided_bot` também disponível com sete argumentos. Não era necessário reinstalar `ops/replace-chart-plan.sql` nem recarregar o cache.
- Não há ocorrências de substituição nos logs publicados da última hora. A mensagem antiga informada não foi reproduzida nesta sessão; portanto não atribuímos o erro atual a uma função ausente nem declaramos uma substituição real operacional.
- Removidos os casts `as never` do caminho de substituição: os argumentos agora são conferidos pelo TypeScript contra o contrato gerado. Estado nulo é normalizado para objeto vazio, como na comparação SQL. Acrescentado diagnóstico somente do código de erro, sem dados do plano/carteira.
- O script atômico existente preserva posição anterior em auditoria, tokens on-chain e contadores diários, salva o novo plano pausado e impede mutex, submissão pendente, carteira incorreta e estado/versão/revisão alterados. A confirmação existente explica que remover da lista não encerra uma posição e que tokens anteriores ficam fora das regras novas.

### Venda manual

- Consulta somente de leitura encontrou GTE com impacto **zero explícito** e slippage **7%** em uma carteira; nas outras configurações GTE os limites de impacto eram 2% e 3%. Não encontramos ausência convertida para zero nesse registro. Não há evidência para atribuir intenção ao zero salvo.
- O campo era `type=number`, incompatível com edição livre usando vírgula, e atalhos colocavam toda a precisão do saldo diretamente no campo. Agora aceita texto decimal brasileiro, calcula unidades com BigInt e rejeita precisão excedente em vez de arredondar quantidades.
- Slider/percentuais/Máx conservam unidades exatas separadas da apresentação compacta. O valor exato selecionado aparece numa linha que pode quebrar, sem inflar o campo. Digitar substitui a seleção exata e valida quantidade positiva e saldo.
- Limites ausentes bloqueiam cotação e solicitam definição; zero explícito continua bloqueando impacto maior que zero. Nenhum limite é ampliado automaticamente.
- Modal "Ajustar limites da venda" separa impacto/slippage, explica efeitos, aceita 0–20% e persiste somente as regras manuais por usuário/carteira/token. Não modifica estratégia ou robô.
- Antes de cotar e antes da preparação para assinatura, servidor lê os limites persistidos e consulta reservas num bloco BSC fresco. Cliente não pode substituir silenciosamente o valor salvo. O mínimo e o resumo usam o slippage manual, sem acrescentar silenciosamente 1 ponto percentual.
- Mensagem de bloqueio fica na tela com ações para editar quantidade/revisar limites. Alterações invalidam a cotação e respostas assíncronas antigas são descartadas. Cotação permanece separada de assinatura.

## Script aplicado nesta etapa

Somente `drizzle/migrations/0026_manual_sale_limits.sql`, criando armazenamento de ajustes manuais com limites CHECK 0–20, GRANT e RLS próprios. Sem INSERT/backfill ou alteração em ordens, estratégias e bots. Migrações históricas e script de substituição não reaplicados.

## Arquivos

- `src/routes/operar.tsx`
- `src/lib/manualSale.ts`, `manualSale.functions.ts`, `manualSale.server.ts`
- `src/components/ManualSaleAmountInput.tsx`, `ManualSaleLimitsDialog.tsx`
- `src/lib/chartRule.functions.ts`, `chartPlan.functions.test.ts`
- Testes `manualSale.test.ts`, `manualSale.functions.test.ts`, `manualSale.server.test.ts`, `manualSale.sql.test.ts`
- Tela isolada `tests/mobile-dialogs/main.tsx`, `AGENTS.md`, `roadmap.md`
- Migração 0026 e tipos gerados automaticamente.

## Validação isolada

- 69 testes específicos aprovados: substituição ativa/pausada/arquivada, retenção/histórico, rollback tardio, mutex/submissão/ordem pendente, concorrência de estado e carteira/usuário/versões; quantidade brasileira, percentuais, Máx, unidade mínima, saldo/precisão, ausência/zero/limites válidos; persistência, falha de gravação, regras iguais no servidor e RLS em PostgreSQL embarcado descartável.
- Navegador com componentes reais e dados fictícios: 360×800, 390×844, 360×420 e 390×420. Digitação, vírgula, cancelamento sem mudança, salvar ajustes, nova cotação, invalidação após editar e Máx exato passaram; sem erros runtime e sem overflow horizontal. Altura de 420 simula área reduzida pelo teclado; teclado físico do celular não foi exercitado.
- TypeScript via tsgo e lint dos arquivos alterados aprovados. Compilação automática: build OK. Build não executado manualmente porque o ambiente o executa automaticamente.
- Suíte completa offline: **558 passaram, 2 falharam**, ambos em `history.server.test.ts`, fora dos fluxos alterados. Lint global: 943 erros de formatação nos arquivos gerados `types.ts`/`previewAuthStorage.ts`, que não podem ser editados manualmente, e 12 avisos anteriores. Não foi reformulado código fora do escopo.

## Confirmado no banco conectado (somente metadados/leitura)

- Função de substituição e sua dependência disponíveis no catálogo e no cache HTTP.
- Novo armazenamento manual existe; nenhum ajuste foi inserido.
- Contagens atuais: 8 bots, 4 carteiras automáticas, 6 estratégias, 30 ordens, 0 travas e 0 ajustes manuais. Os números de carteiras/ordens são os atuais, não os antigos de novembro 7. Nenhuma dessas linhas foi alterada durante o trabalho.
- Não executamos substituição, pausa, início, compra, venda, aprovação, transferência, saque ou conciliação financeira.

## Pendências

- Sessão autenticada do titular indisponível: tentativa de sessão própria informa que não há conta correspondente ao solicitante. Fluxo completo na conta real não verificado; usuário precisa entrar na prévia, sem enviar credenciais.
- Erro específico de substituição atual não reproduzido. Caso reapareça, o código de erro agora fica disponível no servidor; não foi executada uma substituição real para provocá-lo.
- Não houve publicação. Integração de metadados está confirmada, mas isso não equivale a substituir um bot real de ponta a ponta.
- As duas falhas de histórico e lint dos arquivos gerados permanecem fora desta correção.