# Carteira, histórico e assistente móvel — 13/11/2026

Base: `02534e3` (atualização de venda manual feita no Lovable). Trabalho no código pelo GitHub, sem mensagens ao agente Lovable, alterações no banco, publicação ou operações financeiras reais.

## Causas verificadas no código

- Abastecimento: a origem esperada já era conferida antes de enviar, mas a conexão com uma conta diferente era descartada e o aviso aparecia apenas em toast. Não havia comparação persistente dos endereços/rede no formulário.
- Velas: preço atual e OHLC são consultas independentes. O cliente podia devolver histórico salvo após falha sem preservar o sinal dessa falha. Além disso, após expirar a memória do servidor, uma falha da fonte devolvia imediatamente essa mesma memória antiga, sem consultar barras mais novas que outro coletor/processo pudesse ter salvo no banco. Esse caminho foi reproduzido e corrigido em teste isolado. Isso não comprova, por si só, a causa de cada divergência vista em produção.
- Entrada 2: “Selecionando entrada 2…” indica espera por um toque, e não uma consulta em andamento. A próxima seleção era ativada sem levar o usuário de volta ao gráfico.
- Início: depois do sucesso do servidor o assistente só mudava o título e exigia um segundo clique em “Abrir robô”. Falhas de atualização visual após o sucesso não podem oferecer outro início.

## Alterações

- Aviso persistente com conta conectada, origem necessária, rede, endereços completos e reconexão. Eventos de conta/rede invalidam valor/saldo e refazem a leitura. Conta/rede incorretas impedem envio; a verificação ao vivo imediatamente antes da assinatura foi preservada. A carteira automática destinatária não é confundida com a origem pessoal. A interface nativa da Trust não foi modificada.
- Histórico atrasado mostra data/hora da última abertura de vela e atualização explícita. Falha de atualização continua identificada mesmo com cache visível. A memória expirada é combinada com o histórico persistido durante falhas; barras reais salvas continuam preservadas. Trocar token/pool reinicia o enquadramento do gráfico. Não foram criadas velas a partir do marcador de preço nem alteradas decisões dos executores.
- “Marque a entrada 2 no gráfico”, rolagem/foco no gráfico após confirmar e opção de digitar o preço existente preservada. A confirmação e o aviso usam a mesma conversão atual da cotação canônica em BNB, evitando um texto congelado divergente do campo após atualização cambial.
- Após início confirmado: navega para `/grade` com carteira/token exatos, fecha o assistente e seus painéis de origem e volta ao topo. Cliques repetidos são protegidos enquanto a solicitação está em andamento. Erro de início não navega. Sucesso seguido de falha visual mantém o início desabilitado e oferece abertura manual.
- Lint: somente `prettier/prettier` foi desativado para os dois arquivos regenerados pelo Lovable (`types.ts` e `previewAuthStorage.ts`). Conteúdo e regras semânticas desses arquivos foram preservados; a formatação gerada causava os 943 erros anteriores. O restante do lint continua ativo.

## Validação

- Suíte offline: 574 testes unitários/SQL em 133 arquivos. Inclui conta/rede incorretas sem assinatura, seleção da próxima entrada, início/navegação com sucesso e falha, cache durante indisponibilidade, recuperação do arquivo persistido e separação por token/fonte.
- Navegador: 70 cenários em Chromium com 360×800, 390×844, 390×420, 844×390 e 1280×900. Dados fictícios; chamadas externas bloqueadas. Os três cenários novos foram repetidos após incluir uma confirmação aninhada real para conferir foco/rolagem.
- TypeScript, build com rede bloqueada e lint: aprovados; lint mantém 12 avisos anteriores, sem erros.
- Nenhuma venda, compra, transferência, início/substituição real, alteração de saldo, implantação ou migração foi executada.

## Limites e publicação

Os testes de interface usam componentes/hook reais em uma tela isolada; os serviços são simulados. Não equivalem à validação autenticada no dispositivo Trust Wallet do titular nem à comprovação da atualidade da fonte de velas em produção. Não foi usado o chat do Lovable e não houve publicação. Depois da sincronização do GitHub, a prévia e a versão publicada devem ser conferidas separadamente; falhas/rate limit da fonte continuam identificadas, sem prometer velas que ela não forneceu.

## Ambiente de integração contínua

A primeira execução da PR falhou antes dos testes de navegador: `ubuntu-latest` passou a Ubuntu 26.04, não suportado pelo Playwright 1.56.1 já fixado no projeto. Os dois jobs foram fixados em `ubuntu-24.04`, mantendo a versão e os testes existentes. Nenhuma dependência da aplicação foi atualizada.
