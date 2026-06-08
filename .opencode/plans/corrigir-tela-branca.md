# Diagnóstico e Correção — Tela Branca após Login

## Resultado do `clasp pull`

Nenhum arquivo órfão no remoto. Os 15 arquivos estão sincronizados. O problema não é conflito com `Code.gs` velho.

## Causa provável

O CSS do body em `styles.html` foi projetado para centralizar a tela de **login** (`display: flex; justify-content: center; align-items: center; background: linear-gradient(...)`). Quando `app.html` é servida, o mesmo CSS se aplica, podendo causar renderização incorreta ou conteúdo fora da viewport.

Além disso, não há logs para rastrear se o `doGet` está recebendo o token corretamente e se `validateSession` está funcionando.

## Correções

### 1. `Main.gs` — Adicionar logs no `doGet`

Substitua o `doGet` atual por:

```javascript
function doGet(e) {
    var token = e && e.parameter && e.parameter.token;
    console.log('[doGet] token recebido:', token ? token.substring(0, 8) + '...' : 'nenhum');

    if (token) {
        var email = validateSession(token);
        console.log('[doGet] validateSession retornou:', email ? email : 'null (invalido)');
        if (email) {
            return HtmlService.createTemplateFromFile('app').evaluate();
        }
    }

    console.log('[doGet] servindo login.html');
    return HtmlService.createTemplateFromFile('login').evaluate();
}
```

### 2. `app.html` — Corrigir CSS do body

Substitua a tag `<body>`:

**De:**
```html
<body>
    <div id="appScreen" style="width: 100%;">
```

**Para:**
```html
<body style="background: #f4f6fb; display: block; padding: 0; align-items: stretch;">
    <div id="appScreen" style="width: 100%;">
```

### 3. `js_app.html` — Adicionar logs de diagnóstico

No método `init()`, adicione logs:

**De:**
```javascript
init() {
    try {
        const token = this.getToken();
        if (!token) {
            this.redirectToLogin();
            return;
        }
        this.validateAndShowApp(token);
        this.initNavbarLogic();
        this.bindLogout(token);
    } catch (error) {
        console.error('Erro durante a inicializacao do App:', error);
    }
},
```

**Para:**
```javascript
init() {
    try {
        console.log('[App.init] iniciando...');
        const token = this.getToken();
        console.log('[App.init] token:', token ? 'encontrado' : 'ausente');
        if (!token) {
            console.log('[App.init] sem token, redirecionando para login');
            this.redirectToLogin();
            return;
        }
        this.validateAndShowApp(token);
        this.initNavbarLogic();
        this.bindLogout(token);
    } catch (error) {
        console.error('[App.init] Erro:', error);
    }
},
```

No método `getToken()`, adicione logs:

**De:**
```javascript
getToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const sessionToken = sessionStorage.getItem('sco_token');

    if (urlToken && !sessionToken) {
        sessionStorage.setItem('sco_token', urlToken);
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        return urlToken;
    }

    return sessionToken || urlToken;
},
```

**Para:**
```javascript
getToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const sessionToken = sessionStorage.getItem('sco_token');
    console.log('[getToken] URL token:', urlToken ? urlToken.substring(0, 8) + '...' : 'null');
    console.log('[getToken] sessionStorage token:', sessionToken ? sessionToken.substring(0, 8) + '...' : 'null');

    if (urlToken && !sessionToken) {
        sessionStorage.setItem('sco_token', urlToken);
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        console.log('[getToken] token salvo no sessionStorage e URL limpa');
        return urlToken;
    }

    return sessionToken || urlToken;
},
```

No método `validateAndShowApp`, adicione logs:

**De:**
```javascript
validateAndShowApp(token) {
    if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
            .withSuccessHandler((response) => {
                if (response.valid) {
                    const userDisplay = document.getElementById('userDisplayName');
                    if (userDisplay) {
                        userDisplay.textContent = response.email;
                    }
                } else {
                    sessionStorage.removeItem('sco_token');
                    this.redirectToLogin();
                }
            })
            .withFailureHandler(() => {
                this.redirectToLogin();
            })
            .checkSession(token);
    }
},
```

**Para:**
```javascript
validateAndShowApp(token) {
    console.log('[validateAndShowApp] validando token...');
    if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
            .withSuccessHandler((response) => {
                console.log('[validateAndShowApp] resposta:', JSON.stringify(response));
                if (response.valid) {
                    const userDisplay = document.getElementById('userDisplayName');
                    if (userDisplay) {
                        userDisplay.textContent = response.email;
                    }
                } else {
                    sessionStorage.removeItem('sco_token');
                    this.redirectToLogin();
                }
            })
            .withFailureHandler((error) => {
                console.error('[validateAndShowApp] erro:', error);
                this.redirectToLogin();
            })
            .checkSession(token);
    }
},
```

## Como executar

```bash
# Aplicar as 4 alterações com sed
sed -i '1,9c\function doGet(e) {\n    var token = e \&\& e.parameter \&\& e.parameter.token;\n    console.log(\"\[doGet\] token recebido:\", token ? token.substring(0, 8) + \"...\" : \"nenhum\");\n\n    if (token) {\n        var email = validateSession(token);\n        console.log(\"\[doGet\] validateSession retornou:\", email ? email : \"null (invalido)\");\n        if (email) {\n            return HtmlService.createTemplateFromFile(\"app\").evaluate();\n        }\n    }\n\n    console.log(\"\[doGet\] servindo login.html\");\n    return HtmlService.createTemplateFromFile(\"login\").evaluate();\n}' Main.gs

# Este comando sed é complexo demais para uma linha. Melhor editar manualmente.
# Instruções simples:
```

Na verdade, por ser multi-arquivo, sugiro copiar o conteúdo de cada bloco acima diretamente nos arquivos:

1. Abra `Main.gs` e substitua o `doGet` pelo novo com logs
2. Abra `app.html` e mude `<body>` para `<body style="background: #f4f6fb; display: block; padding: 0; align-items: stretch;">`
3. Abra `js_app.html` e faça as 3 substituições nos métodos `init`, `getToken`, e `validateAndShowApp`
4. `clasp push`

Depois, ao logar novamente, abra o console do navegador (F12) e veja os logs `[doGet]`, `[App.init]`, `[getToken]`, `[validateAndShowApp]` — isso vai mostrar exatamente onde o fluxo quebra.
