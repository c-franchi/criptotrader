# CryptoBot — histórico contínuo de velas (BSC)

## Diagnóstico
Antes, \`price_candles\` era apenas um snapshot de até 300 velas (aprox. 25 horas) gravado quando um endpoint era chamado. Páginas mais antigas só eram guardadas no navegador/na memória do processo. Reiniciar o PWA ou o servidor podia exigir novas chamadas ao GeckoTerminal, inclusive durante limites 429.

O app instalado no Android não consegue manter coleta 24/7 quando fechado. A coleta precisa ser executada no backend.

## Instalação obrigatória no banco de PRODUÇÃO correto
1. Publicar/implantar a versão contendo \`/api/public/hooks/candle-tick\`. Não rodar o cron antes dessa publicação.
2. Aplicar \`drizzle/migrations/0022_market_candle_archive.sql\` no banco conectado à versão publicada. Confirme as tabelas \`market_candle_bars\`, \`market_candle_watch\` e \`market_candle_heartbeat\`. Drizzle journal no GitHub **não** aplica SQL automaticamente ao banco.
3. Confirmar que o job existente \`grid-tick\` funciona, com segredo válido e apontando ao mesmo domínio publicado. Não mexer nos parâmetros das operações financeiras.
4. Aplicar \`ops/market-candle-cron.sql\` no mesmo banco. O script agenda \`market-candle-tick\` a cada minuto, reutilizando com segurança o comando HTTP autorizado do grid-tick. Não imprime nenhum token.
5. Abrir uma vez o gráfico de cada ativo que se deseja monitorar; \`getCandles\` registra o pool/token. O coletor preserva a assinatura de monitoramento no banco e continua após o fechamento do PWA.
6. Em Integrações verificar: arquivo PostgreSQL OK, coleta executada nos últimos 4 minutos e mercado sincronizado. Conferir \`cron.job_run_details\` se estiver atrasado; verificar resposta HTTP 401/503 apenas por logs seguros, sem revelar cabeçalhos.

## Comportamento
- A cada minuto o job seleciona até **2 mercados** com lease transacional. Cada mercado atualizado recebe as velas recentes verdadeiras de 5 minutos e tenta uma página histórica anterior (até 1000 velas).
- A coleta e a paginação persistem no arquivo por timestamp, sem descartar velas antigas. Falhas da fonte usam registros salvos, com nova tentativa futura e sem criar velas artificiais.
- A tela prioriza o banco para páginas históricas. A fonte pública complementa o que ainda não foi arquivado.
- A API pública pode oscilar e limitar chamadas; a continuidade total e tempo real de uma corretora exigem infraestrutura, monitoramento e eventualmente provedor de dados com SLA. **Não há garantia de disponibilidade 100%**.
- Histórico do gráfico **não** é fonte substituta de preço atual para ordens. O executor, seus controles, mutexes, cálculos de taxas e a conciliação continuam separados.

## Verificações seguras (não exibir \`cron.job.command\`)
\`\`\`sql
SELECT jobname, jobid, schedule, active
FROM cron.job
WHERE jobname IN ('grid-tick','market-candle-tick');

SELECT last_invoked_at, last_success_at, claimed, saved, backfilled, failed
FROM public.market_candle_heartbeat
WHERE id = 1;

SELECT pool, token, last_success_at, last_candle_at, last_error
FROM public.market_candle_watch
ORDER BY last_success_at DESC NULLS LAST LIMIT 20;

SELECT pool, token, count(*) AS bars, to_timestamp(max(ts)) AS newest
FROM public.market_candle_bars GROUP BY pool, token ORDER BY newest DESC LIMIT 20;
\`\`\`

Se o banco foi trocado ao mudar de workspace, deve-se reconfigurar os jobs e as variáveis com segurança no **novo** banco. Merge GitHub e publicação não transferem dados nem cron jobs entre bancos.
