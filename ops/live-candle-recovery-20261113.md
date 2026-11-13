# Recuperação automática de velas recentes — 13/11/2026

## Evidência e limite do diagnóstico

O print mostra velas de 11/11 enquanto a cotação atual já está na região de US$ 69 mil. A correção anterior identificava atraso e recuperava o arquivo persistido, mas todas as atualizações de tela ainda dependiam da mesma chamada ao servidor do aplicativo.

Consultas GET diretamente à API pública GeckoTerminal retornaram 300 velas reais de 5m para as pools BTCB/WBNB (`0x61eb789d75a95caa3ff50ed7e47b96c132fec082`) e GTE/WBNB (`0x63123ad4b95b02f579c0c5649ba43379b64860a0`). A API confirmou CORS (`Access-Control-Allow-Origin: *`, GET) com a origem do CryptoBot. Para BTCB, a última abertura avançou de **13/11 às 14h10 UTC** para **14h20 UTC (11h20 de Brasília)** em uma segunda leitura às 14h23 UTC. Para GTE, a última abertura nessa segunda leitura era 14h05 UTC; não inventamos atividade em um mercado sem novos dados. Amostras reais dessa resposta, com 36 barras, estão em `src/test/fixtures` para testar o contrato do parser.

Isso comprova que a fonte pública tinha dados recentes e que existe um transporte de leitura utilizável pelo navegador. Não comprova qual erro específico de rede/cache ocorreu no servidor publicado: a tentativa de diagnóstico pela server function foi bloqueada pela revisão automática porque ela também pode registrar a pool no banco. Não foi repetida por outro caminho. A ferramenta de metadados Lovable retornou erro interno. Não houve chat com o agente Lovable, publicação, mudança de configuração no banco nem operação financeira.

## Correção

- `useCandles` mantém o servidor como primeira opção, mas consulta automaticamente a API pública **no navegador** se o servidor devolver histórico antigo, falhar ou demorar mais de 1,5 s. Uma resposta recente válida libera a tela sem esperar a outra conexão. O servidor tem deadline de 9 s; a consulta direta, 8 s.
- A consulta direta solicita OHLCV de 5m em USD da **mesma pool e do mesmo contrato BSC**. Não usa o ponto laranja, não troca o ativo por BTC de uma corretora e não consulta carteiras. Sem API key, cookies, sessão do usuário, assinatura ou acesso ao banco.
- Valida identidade do token quando os metadados existem, timestamps, ordenação, limites OHLC e volume. Aceita somente barras reais; nenhuma cotação isolada vira vela.
- Requisições diretas são agrupadas por pool/token, reutilizadas por um minuto e respeitam backoff global em 429. Um servidor saudável evita consultas diretas adicionais.
- O dado recente substitui a cópia antiga na tela e atualiza o cache do aparelho; dados da mesma fonte são combinados sem apagar páginas anteriores. Fontes com metodologias diferentes continuam separadas.
- Histórico atrasado é considerado stale imediatamente ao montar a tela, sem esperar um minuto por causa do timestamp de sucesso de uma resposta antiga.
- A recuperação é somente de visualização. O executor continua usando as consultas e guardas existentes; nenhum início, compra, venda ou regra de decisão foi alterado.

## Verificação

- 585 testes offline passaram em 135 arquivos, incluindo recuperação de snapshot antigo, servidor travado, falha dupla, limites de requisições, ausência de credenciais, validação com respostas reais de BTCB/GTE e persistência do novo fechamento no cache. Uma primeira execução simultânea ao build excedeu os 5 s de um teste SQL anterior; a suíte completa com dois workers passou sem ampliar timeout ou alterar o teste.
- Teste de navegador usa o hook `useCandles` e o `CandleChart` reais: servidor simulado retorna o snapshot antigo e a fonte pública interceptada retorna a amostra capturada em 13/11. Verifica o fechamento recente, desaparecimento do alerta e renderização do SVG. A interceptação evita qualquer server function publicada ou operação externa durante os testes.
- TypeScript, build com rede bloqueada e lint aprovados; mantidos os 12 avisos anteriores.

## Aplicação

A integração no GitHub não publica automaticamente o site. É necessário atualizar a versão publicada pelo fluxo normal do projeto e conferir na sessão/dispositivo do titular. A consulta pública foi comprovada nesta sessão; a recuperação na aplicação foi comprovada em teste isolado. Não foi declarada uma validação autenticada em produção nem uma garantia de disponibilidade 100% de uma API externa.
