# Verificação dos modais no mobile — 09/11/2026

Base: `bf96d4cc35c0c76b249d4efdaa9e313b0aca6594` (PR #63).

## Alterações

- O componente Dialog deixa de misturar utilitários de centralização com o posicionamento do painel inferior. O CSS passa a controlar a posição e os limites laterais.
- Corpo rolável e flexível nos modais de detalhes, mantendo título e rodapé acessíveis, inclusive com janela baixa.
- Áreas seguras, campos limitados à largura disponível, botão X de 44 px e nome acessível em português.
- Descrição acessível padrão, fechamento por Escape, devolução de foco à ação que abriu o modal e respeito a movimento reduzido.
- Cabeçalho com quebra de linha e alvos de toque de 44 px no celular.
- Viewport solicita redimensionamento do conteúdo com o teclado nos navegadores compatíveis.
- Corrigidos os 1.018 erros de formatação que bloqueavam o lint. Os cinco arquivos dessa limpeza foram comparados com a saída do Prettier aplicada à versão original: nenhuma alteração funcional nesses arquivos.

## Resultados locais

| Verificação                  | Resultado                                                 |
| ---------------------------- | --------------------------------------------------------- |
| TypeScript                   | Passou                                                    |
| Testes unitários/componentes | 508/508 em 125 arquivos                                   |
| Testes de navegador          | 35/35 com Chromium Headless Shell 141 / Playwright 1.56.1 |
| Acessibilidade automática    | Sem violações WCAG A/AA nos cenários testados com axe     |
| Build                        | Passou                                                    |
| Lint global                  | Passou: 0 erros e 12 avisos preexistentes                 |
| Integridade do diff          | Passou                                                    |

Os testes de navegador usam os componentes reais `UxDetailDialog`, `Dialog`, `WalletPicker` e o CSS do aplicativo em uma página isolada, sem importar clientes de banco, autenticação ou execução. A página contém conteúdo fictício extenso e endereço longo; o cabeçalho reproduz a composição visual e as classes responsivas do AppShell.

Viewports: 360×800, 390×844, 390×420, 844×390 e 1280×900. Foram verificados limites de posição, corpo sem overflow horizontal, último campo acessível após rolagem, título/ações visíveis, Tab/Shift+Tab, Escape, foco ao fechar, seletor de carteira aninhado, alvos de toque, fonte ampliada e movimento reduzido. As imagens de 360/390 px, janela baixa e desktop foram inspecionadas visualmente.

Comparação com a versão anterior: com o mesmo cenário de 390 px, a versão base falhou ao devolver o foco ao botão que abriu o modal. O corte lateral dos prints do aparelho não foi reproduzido nesse Chromium; a mudança remove o conflito de posicionamento identificado no código, mas não se deve afirmar reprodução exata do navegador do usuário.

## Isolamento e limites

- `bun run test:offline` bloqueia fetch e conexões HTTP/HTTPS/TCP nos testes unitários, além dos mocks existentes. Não usa credenciais para validação ao vivo.
- Os testes de navegador abortam requisições que não sejam para o servidor local da página isolada.
- Nenhuma operação de compra, venda, saque, ativação ou parada de robôs foi executada. Nenhuma migração ou alteração de dados foi aplicada.
- Os testes de carteira aninhada validam apresentação e foco. Não substituem teste ponta a ponta autenticado de todas as carteiras e estratégias reais.
- A janela de 390×420 testa restrição de altura; não representa execução de teclado virtual real em Android/iOS. Não houve teste em aparelho físico, leitor de tela humano, Safari/WebKit ou sessão de produção autenticada.
- Os 12 avisos de lint anteriores continuam visíveis; as regras não foram desativadas.
- O aviso de bundle grande do AppShell permanece. Não foi medido ganho de velocidade.

## Reprodução

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test:offline
bun run lint
bun run build
bunx playwright install --with-deps chromium
bun run test:ui
```

O workflow `Verify` executa a suíte offline e um job separado `mobile-dialogs`, com relatório HTML e capturas por sete dias. A página de testes só é servida por `test:ui:serve`; não foi adicionada às rotas do aplicativo nem ao deploy de produção.

Publicação deve usar a versão integrada à main após aprovação dos checks remotos. Este trabalho não executa publicação no Lovable.
