# Tela de Login e Registro (Google Apps Script)

Este projeto implementa uma tela de login e registro utilizando Google Apps Script (GAS) para o backend e HTML/CSS/JavaScript para o frontend. O objetivo principal foi refatorar o código existente, aplicando princípios de Clean Code, separação de conceitos (SoC), performance e segurança.

## Estrutura de Arquivos

A estrutura do projeto foi organizada para facilitar a manutenibilidade e a modularidade, seguindo as melhores práticas para desenvolvimento com Google Apps Script.

*   `Code.gs`: Contém a lógica de backend em Google Apps Script. Inclui a função `doGet()` para servir a página HTML, a função `include()` para injeção de parciais HTML e a função `processLogin()` para autenticação de usuários.
*   `index.html`: A estrutura HTML5 principal da aplicação. Este arquivo age como o esqueleto da página, orquestrando a injeção dos demais componentes (CSS, JavaScript, validação, loading) através de scriptlets do GAS.
*   `styles.html`: Contém todos os estilos CSS da aplicação. Utiliza variáveis CSS para facilitar a personalização e inclui media queries para garantir a responsividade em diferentes tamanhos de tela.
*   `javascript.html`: O arquivo central para o JavaScript frontend. Implementa o namespace `App` para organizar a lógica da aplicação, gerenciar eventos da UI (alternância de formulários, submissão) e interagir com o backend do GAS através de `google.script.run`.
*   `validacao.html`: Um módulo JavaScript dedicado exclusivamente às regras de validação de formulário (e-mail, senha, nome de usuário) e funcionalidades como a alternância de visibilidade da senha.
*   `loading.html`: Contém o HTML e JavaScript para um componente de feedback visual (spinner/overlay) que é exibido durante operações assíncronas (ex: envio de formulário para o servidor GAS).

## Como Funciona

1.  **Serviço HTML (GAS `doGet()`):** Quando a URL do Script Web é acessada, a função `doGet()` em `Code.gs` renderiza o `index.html`.
2.  **Injeção de Parciais (`include()`):** O `index.html` utiliza a função `include()` (definida em `Code.gs`) para injetar dinamicamente o conteúdo de `styles.html`, `javascript.html`, `validacao.html` e `loading.html` em suas respectivas seções.
3.  **Frontend Interativo:** O `javascript.html` gerencia a alternância entre os formulários de login e registro, validações de input e a comunicação assíncrona com o backend via `google.script.run`.
4.  **Backend (GAS):** As funções em `Code.gs` (como `processLogin`) são chamadas do frontend para realizar operações como autenticação, processamento de dados, etc.

## Desenvolvimento e Deploy

Este projeto é desenvolvido localmente usando Visual Studio Code e gerenciado com `clasp` para sincronização com o Google Apps Script.

### Pré-requisitos

*   Node.js e npm instalados.
*   `clasp` instalado globalmente: `npm install -g @google/clasp`
*   Um projeto Google Apps Script associado (via `clasp login` e `clasp clone <scriptId>` ou `clasp create`).

### Comandos Úteis com `clasp`

*   `clasp login`: Autoriza `clasp` a acessar sua conta Google.
*   `clasp clone <Script ID>`: Clona um projeto GAS existente para o diretório atual.
*   `clasp create --type html --title "Tela de Login Refatorada"`: Cria um novo projeto GAS do tipo HTML.
*   `clasp push`: Envia todos os arquivos locais para o projeto GAS remoto.
*   `clasp pull`: Baixa as últimas alterações do projeto GAS remoto para o local.
*   `clasp open`: Abre o projeto GAS no navegador.

## Segurança

Para evitar vulnerabilidades de Cross-Site Scripting (XSS) ao usar `<?!= include('filename'); ?>`:

*   **Nunca injete dados de usuário diretamente** com `<?!=`. Sempre use `<?=`, que escapa automaticamente o HTML, ou sanitize os dados do usuário no servidor antes de injetá-los.
*   Garanta que todos os arquivos incluídos (como `styles.html`, `javascript.html`) contenham apenas código confiável e estático, ou dados que foram devidamente sanitizados.

## Próximos Passos (Desenvolvimento)

*   Implementar a lógica de registro de usuário no `Code.gs`.
*   Adicionar tratamento de erros mais robusto e feedback visual aprimorado para o usuário.
*   Integrar APIs de autenticação de redes sociais.
*   Expandir a validação de formulários com feedback em tempo real para o usuário.
