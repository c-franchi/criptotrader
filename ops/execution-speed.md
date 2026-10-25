# Tempo de execução e observação por blocos

O agendamento continua com alvo de 2 segundos. Não é SLA nem garantia de captar um toque de preço. O cache vivo foi reduzido a 300 ms; chamadas simultâneas compartilham bloco e cotação. A estratégia reaproveita reservas do mesmo bloco usado na decisão. Nenhum preço histórico é promovido a cotação atual.

As etapas medidas começam na avaliação do servidor, não no instante de cruzamento do preço. Há registros de sinal, preparação, assinatura, tentativa de envio e confirmação observada; ausência de medição fica como não medida. Ciclos sem sinal são amostrados por instância a cada minuto para reduzir gravações. O diário continua sendo a fonte de verdade e não há alteração de mutexes, nonces, slippage ou confirmação exigida. A fase enviada indica comunicação ou tentativa junto ao RPC, não inclusão garantida em bloco.

BSC_RPC_FALLBACK_URL é opcional; o padrão é o endpoint público oficial alternativo da BNB Chain. Ambos os provedores são verificados para chain 56, com bloqueio de resposta de bloco antigo no caminho ao vivo. A cotação inteira é refeita num único provedor e bloco em caso de falha; não se misturam reservas de diferentes provedores numa mesma decisão. Fallback é somente para leituras. Broadcast, trace e outros métodos não são tentados em outro endpoint. Os testes de RPC são somente de leitura e não revelam URLs com credenciais.

## Worker opcional por WebSocket

Não há processo permanente configurado no projeto. Não iniciar um observador em segundo plano dentro de uma requisição HTTP: sua vida útil não é garantida após a resposta. O componente abaixo deve rodar num serviço Node.js persistente supervisionado, com reinício, métricas e um provedor WSS compatível. Isso NÃO está ativado somente por publicar o site.

1. No ambiente seguro do serviço, definir BSC_WSS_URL (wss), BOT_TICK_URL (o endpoint HTTPS `/api/public/hooks/grid-tick` do domínio publicado) e BOT_TICK_TOKEN (o segredo existente autorizado do agendador). Não expor esses valores no cliente, em commits ou no chat.
2. Usar o código e dependências do repositório: `node ops/block-watcher.mjs`.
3. Validar a rede 56, blocos recentes e monitorar respostas do endpoint. O worker coalesce blocos e mantém apenas uma chamada ao executor por vez. Não possui chaves de carteiras, não transmite transações, não arma bots nem muda regras.
4. Manter o agendamento periódico e os mutexes de execução. Na interface, disparos por bloco só aparecem quando realmente registrados pelo executor para aquele bot. A presença de variável ou conexão aberta não é anunciada como operação ativa.
5. Não aumentar permissões nem aprovações de tokens para tentar reduzir o tempo. Não desligar confirmações, controles de gasto ou conciliação.

Não há contratação ou provisionamento automático de serviço externo neste ajuste. A ativação depende de infraestrutura persistente e configuração segura disponíveis.
