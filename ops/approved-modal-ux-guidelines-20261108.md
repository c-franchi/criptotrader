# CryptoBot — padrão visual aprovado (08/11/2026)

O usuário aprovou um protótipo de três telas escuras: **Robô (visão compacta)**, **Editar valores (modal)** e **Proteções (modal)**. Este documento preserva o padrão para novas funcionalidades.

## Princípios
1. Visão principal = **estado verificável, token/carteira, resumo e ação prioritária**. Não abrir formulários longos na página.
2. Alterações e informações secundárias = **modal responsivo** com título explícito e conteúdo focado. No Android/iOS o modal vira bottom sheet com rolagem interna, botão claro e tamanho seguro.
3. Visual = **azul elétrico em ações**, cartões cinza-escuro com cantos arredondados, superfície preta/azul-marinho, espaçamento generoso. Respeitar o tema claro selecionado e acessibilidade.
4. Preservar avisos de risco **no resumo principal**: robô ligado/pausado, operação pendente, erro de execução, dados financeiros não comprovados. Nunca substituir saldo desconhecido por zero, nem preços atrasados por atuais.
5. Salvar uma estratégia e ligar o robô são atos **distintos**. Edição em modal não pode iniciar a operação. Botões de confirmação financeira continuam explícitos, sem bypass, via AlertDialog/validação do servidor.

## Componentes reutilizáveis
- `src/components/UxDetailDialog.tsx`: `UxActionTile` (ação com ícone) e `UxDetailDialog` (modal acessível). Os formulários **não** devem inventar uma gravação ao fechar. Em estratégia, `Revisar e salvar` abre a revisão existente com validação e botão de gravação real.
- `src/components/AppShell.tsx`: navegação consistente, seletor de carteiras por modal, emergência preservada.
- `src/components/ui/dialog.tsx` e `src/styles.css`: design aplicado aos outros diálogos existentes sem afetar diálogos de confirmação de operações reais ou Sheet do menu lateral.

## Cobertura das páginas
- **Painel:** cotação e gráfico principais; liquidez/volume e fundos sob demanda.
- **Robô:** carteira, token, status, resumo e ações; dados de posições e histórico em modal; controles de segurança continuam protegidos.
- **Regras deste robô:** editor existente segmentado em valores, entrada, saída, proteções, orçamento, tempo e revisão, sem mais links azuis de âncoras.
- **Operar:** formulário de compra/venda e cotação continuam principais; histórico, resultado e dados técnicos em modal.
- **Carteiras:** fundos em destaque; perfil, carteiras salvas, cadastro e administração dos robôs por modal.
- **Avisos:** status e contagem em resumo; ativação, configuração e listagem em modais.
- **Métricas:** gráfico e estatísticas principais; detalhes extras em modal.
- **Integrações (ADM):** status resumido, diagnóstico de cada serviço sob demanda.
- **Login/Instalar:** telas de propósito único recebem o design global, sem inventar etapas adicionais.

## Checklist de publicação
- TypeScript, 100% testes (incluindo novo teste de modal), build; alterações sem novos erros de lint.
- Painel e Robô em largura 360px/390px e desktop: legibilidade, botões sem overflow, modal abrindo/fechando pelo teclado e mobile, folha rolável sob teclado.
- Operar: revisão/assinatura da transação permanecem intactas.
- Carteiras/Robô: troca de carteira preserva token e não revela uma configuração de outra carteira; rascunhos não ativam execução.
- Ações de emergência e erros de executor **sempre visíveis**, inclusive em estado pausado.
- Publicar no Lovable só após sincronizar a `main`, sem alterações de banco, chaves, jobs ou operações financeiras.
