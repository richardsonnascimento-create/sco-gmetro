# Plano de Refatoração — Modularização do Login

## Resumo das alterações

```
ANTES:                         DEPOIS:
Code.gs        → Remover       Config.gs
index.html     → Remover       SheetService.gs
javascript.html → Remover      AuthService.gs
styles.html    → Manter        SessionService.gs
navbar.html    → Manter        Main.gs
loading.html   → Manter        login.html (novo)
validacao.html → Manter        app.html (novo)
                               js_utils.html (novo)
                               js_auth.html (novo)
                               js_app.html (novo)
                               styles.html → Manter
                               navbar.html → Manter
                               loading.html → Manter
                               validacao.html → Manter
```

## Passo 1 — Criar back-end (.gs)

Crie cada arquivo abaixo **na raiz do projeto**:

### 1.1 `Config.gs`

```javascript
var SHEETS_ID = PropertiesService.getScriptProperties().getProperty('SHEETS_ID');

if (!SHEETS_ID) {
    throw new Error(
        'Por favor, configure a propriedade do script SHEETS_ID com o ID da sua planilha.',
    );
}

var SHEET_NAME = 'Usuarios';
var SALT =
    PropertiesService.getScriptProperties().getProperty('PASSWORD_SALT') || 'SCO_Salt_2024_v1';
var LOCKOUT_DURATION_MS = 15 * 60 * 1000;
var MAX_LOGIN_ATTEMPTS = 5;
var SESSION_TOKEN_PROPERTY = 'sessionTokens';
```

### 1.2 `SheetService.gs`

```javascript
function getUsersSheet() {
    try {
        var spreadsheet = SpreadsheetApp.openById(SHEETS_ID);
        var sheet = spreadsheet.getSheetByName(SHEET_NAME);

        if (!sheet) {
            sheet = spreadsheet.insertSheet(SHEET_NAME);
            sheet
                .getRange(1, 1, 1, 7)
                .setValues([
                    [
                        'Email',
                        'Username',
                        'PasswordHash',
                        'CreatedDate',
                        'Status',
                        'LastLoginAttempt',
                        'FailedAttempts',
                    ],
                ]);
            sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
            sheet.getRange(1, 1, 1, 7).setBackground('#e8e8e8');
        }

        return sheet;
    } catch (error) {
        console.error('Erro ao acessar a planilha de usuarios:', error);
        throw new Error('Erro ao acessar o banco de dados de usuarios.');
    }
}

function findUserByEmail(email) {
    var sheet = getUsersSheet();
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
        if (data[i][0] === email) {
            return {
                email: data[i][0],
                username: data[i][1],
                passwordHash: data[i][2],
                createdDate: data[i][3],
                status: data[i][4],
                lastLoginAttempt: data[i][5],
                failedAttempts: data[i][6] || 0,
            };
        }
    }

    return null;
}

function addUserRow(email, username, passwordHash, status) {
    var sheet = getUsersSheet();
    var createdDate = new Date().toISOString();
    sheet.appendRow([email, username, passwordHash, createdDate, status, 0, 0]);
}

function updateFailedAttempt(email, attempts, timestamp) {
    var sheet = getUsersSheet();
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
        if (data[i][0] === email) {
            sheet.getRange(i + 1, 6).setValue(timestamp);
            sheet.getRange(i + 1, 7).setValue(attempts);
            break;
        }
    }
}

function resetFailedAttempts(email) {
    var sheet = getUsersSheet();
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
        if (data[i][0] === email) {
            sheet.getRange(i + 1, 6).setValue(0);
            sheet.getRange(i + 1, 7).setValue(0);
            break;
        }
    }
}
```

### 1.3 `AuthService.gs`

```javascript
function hashPassword(password) {
    var raw = Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        password + SALT,
    );
    return raw.map(function (b) {
        return ('0' + (b & 0xFF).toString(16)).slice(-2);
    }).join('');
}

function checkAccountLockout(email) {
    var user = findUserByEmail(email);
    if (!user) return { blocked: false };

    var now = new Date().getTime();
    var lastAttempt = user.lastLoginAttempt || 0;

    if (lastAttempt > 0 && now - lastAttempt < LOCKOUT_DURATION_MS) {
        var lockoutEnd = new Date(lastAttempt + LOCKOUT_DURATION_MS);
        var remainingMinutes = Math.ceil((lockoutEnd.getTime() - now) / 60000);
        return {
            blocked: true,
            message: 'Conta temporariamente bloqueada. Tente novamente em ' + remainingMinutes + ' minutos.',
        };
    }

    return { blocked: false };
}

function recordFailedLoginAttempt(email) {
    try {
        var lock = LockService.getScriptLock();
        lock.tryLock(10000);

        if (!lock.hasLock()) return;

        var user = findUserByEmail(email);
        if (!user) return;

        var attempts = (user.failedAttempts || 0) + 1;
        var now = new Date().getTime();

        updateFailedAttempt(email, attempts, now);

        if (attempts >= MAX_LOGIN_ATTEMPTS) {
            var sheet = getUsersSheet();
            var data = sheet.getDataRange().getValues();

            for (var i = 1; i < data.length; i++) {
                if (data[i][0] === email) {
                    sheet.getRange(i + 1, 5).setValue(false);
                    console.log('Usuario bloqueado por exceder tentativas:', email);
                    break;
                }
            }
        }
    } catch (error) {
        console.error('Erro ao registrar tentativa falhada:', error);
    } finally {
        lock.releaseLock();
    }
}

function resetLoginAttempts(email) {
    try {
        resetFailedAttempts(email);
    } catch (error) {
        console.error('Erro ao resetar tentativas:', error);
    }
}

function processLogin(email, password) {
    try {
        if (!email || !password) {
            return { success: false, message: 'Email e senha sao obrigatorios.' };
        }

        var rateCheck = checkAccountLockout(email);
        if (rateCheck.blocked) {
            return { success: false, message: rateCheck.message };
        }

        var user = findUserByEmail(email);

        if (!user) {
            return { success: false, message: 'Email ou senha incorretos.' };
        }

        if (!user.status) {
            return {
                success: false,
                message: 'Sua conta esta desativada. Entre em contato com o administrador.',
            };
        }

        var providedHash = hashPassword(password);
        if (providedHash === user.passwordHash) {
            resetLoginAttempts(email);
            var token = createSession(email);
            console.log('Login bem-sucedido para:', email);
            return { success: true, message: 'Login bem-sucedido!', token: token };
        } else {
            recordFailedLoginAttempt(email);
            return { success: false, message: 'Email ou senha incorretos.' };
        }
    } catch (error) {
        console.error('Erro durante o login:', error);
        return { success: false, message: 'Ocorreu um erro durante o login. Tente novamente.' };
    }
}

function registerUser(username, email, password) {
    try {
        if (!username || !email || !password) {
            return { success: false, message: 'Todos os campos sao obrigatorios.' };
        }

        if (username.length < 3) {
            return {
                success: false,
                message: 'O nome de usuario deve ter pelo menos 3 caracteres.',
            };
        }

        var emailRegex =
            /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
        if (!emailRegex.test(email)) {
            return { success: false, message: 'Por favor, insira um e-mail valido.' };
        }

        if (password.length < 6) {
            return { success: false, message: 'A senha deve ter pelo menos 6 caracteres.' };
        }

        var existingUser = findUserByEmail(email);
        if (existingUser) {
            return { success: false, message: 'Este email ja esta registrado.' };
        }

        var passwordHash = hashPassword(password);
        addUserRow(email, username, passwordHash, false);

        console.log('Novo usuario registrado (aguardando ativacao):', email);
        return {
            success: true,
            message: 'Registro bem-sucedido! Aguarde a ativacao da sua conta pelo administrador.',
        };
    } catch (error) {
        console.error('Erro durante o registro:', error);
        return { success: false, message: 'Ocorreu um erro durante o registro. Tente novamente.' };
    }
}
```

### 1.4 `SessionService.gs`

```javascript
var SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

function createSession(email) {
    var token = Utilities.getUuid();
    var properties = PropertiesService.getScriptProperties();
    var sessionsJson = properties.getProperty(SESSION_TOKEN_PROPERTY);
    var sessions = sessionsJson ? JSON.parse(sessionsJson) : {};

    sessions[token] = {
        email: email,
        createdAt: new Date().getTime(),
    };

    properties.setProperty(SESSION_TOKEN_PROPERTY, JSON.stringify(sessions));
    return token;
}

function validateSession(token) {
    if (!token) return null;

    var properties = PropertiesService.getScriptProperties();
    var sessionsJson = properties.getProperty(SESSION_TOKEN_PROPERTY);
    if (!sessionsJson) return null;

    var sessions = JSON.parse(sessionsJson);
    var session = sessions[token];
    if (!session) return null;

    var now = new Date().getTime();
    if (now - session.createdAt > SESSION_DURATION_MS) {
        destroySession(token);
        return null;
    }

    return session.email;
}

function destroySession(token) {
    if (!token) return;

    var properties = PropertiesService.getScriptProperties();
    var sessionsJson = properties.getProperty(SESSION_TOKEN_PROPERTY);
    if (!sessionsJson) return;

    var sessions = JSON.parse(sessionsJson);
    delete sessions[token];
    properties.setProperty(SESSION_TOKEN_PROPERTY, JSON.stringify(sessions));
}

function getCurrentUserEmail(token) {
    return validateSession(token);
}
```

### 1.5 `Main.gs`

```javascript
function doGet(e) {
    var token = e && e.parameter && e.parameter.token;

    if (token && validateSession(token)) {
        return HtmlService.createTemplateFromFile('app').evaluate();
    }

    return HtmlService.createTemplateFromFile('login').evaluate();
}

function include(filename) {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function loginUser(email, password) {
    return processLogin(email, password);
}

function registerNewUser(username, email, password) {
    return registerUser(username, email, password);
}

function logoutUser(token) {
    destroySession(token);
}

function checkSession(token) {
    var email = validateSession(token);
    if (email) {
        return { valid: true, email: email };
    }
    return { valid: false };
}
```

## Passo 2 — Remover `Code.gs`

```bash
rm Code.gs
```

## Passo 3 — Criar front-end (.html)

### 3.1 `js_utils.html`

```html
<script>
    const Message = {
        show(text, type = 'info') {
            const container = document.getElementById('messageContainer');
            if (!container) return;

            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${type}`;
            
            const icons = {
                success: '<i class="bx bx-check-circle"></i>',
                error: '<i class="bx bx-x-circle"></i>',
                info: '<i class="bx bx-info-circle"></i>'
            };
            
            const sanitizedText = this.escapeHtml(text);
            
            messageDiv.innerHTML = `
                <span class="message-icon">${icons[type] || icons.info}</span>
                <span class="message-text">${sanitizedText}</span>
            `;
            
            container.innerHTML = '';
            container.appendChild(messageDiv);
            container.classList.add('show');
            
            setTimeout(() => {
                container.classList.remove('show');
            }, 5000);
        },

        hide() {
            const container = document.getElementById('messageContainer');
            if (container) {
                container.classList.remove('show');
            }
        },

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };
</script>
```

### 3.2 `js_auth.html`

```html
<script>
    const Auth = {
        init() {
            try {
                this.bindUIActions();
                this.initRealTimeValidation();
            } catch (error) {
                console.error('Erro durante a inicializacao do Auth:', error);
            }
        },

        bindUIActions() {
            const container = document.querySelector('.container');
            const registerBtn = document.querySelector('.register-btn');
            const loginBtn = document.querySelector('.login-btn');
            const loginForm = document.getElementById('loginForm');
            const registerForm = document.getElementById('registerForm');
            const showLoginPassword = document.getElementById('showLoginPassword');
            const showRegisterPassword = document.getElementById('showRegisterPassword');

            if (registerBtn && container) {
                registerBtn.addEventListener('click', () => {
                    container.classList.add('active');
                });
            }

            if (loginBtn && container) {
                loginBtn.addEventListener('click', () => {
                    container.classList.remove('active');
                });
            }

            if (loginForm) {
                loginForm.addEventListener('submit', this.handleLoginSubmit.bind(this));
            }
            if (registerForm) {
                registerForm.addEventListener('submit', this.handleRegisterSubmit.bind(this));
            }

            if (showLoginPassword) {
                showLoginPassword.addEventListener('change', (event) => {
                    Validation.togglePasswordVisibility('loginPassword', event.target.checked);
                });
            }

            if (showRegisterPassword) {
                showRegisterPassword.addEventListener('change', (event) => {
                    Validation.togglePasswordVisibility('registerPassword', event.target.checked);
                });
            }
        },

        initRealTimeValidation() {
            const loginEmail = document.getElementById('loginEmail');
            const loginPassword = document.getElementById('loginPassword');
            const registerUser = document.getElementById('registerUser');
            const registerEmail = document.getElementById('registerEmail');
            const registerPassword = document.getElementById('registerPassword');

            if (loginEmail) {
                loginEmail.addEventListener('input', () => {
                    this.clearFieldError(loginEmail);
                    if (loginEmail.value && !Validation.validateEmail(loginEmail.value)) {
                        this.showFieldError(loginEmail, 'Email invalido');
                    }
                });
                loginEmail.addEventListener('blur', () => {
                    if (loginEmail.value && !Validation.validateEmail(loginEmail.value)) {
                        this.showFieldError(loginEmail, 'Email invalido');
                    }
                });
            }

            if (loginPassword) {
                loginPassword.addEventListener('input', () => {
                    this.clearFieldError(loginPassword);
                });
            }

            if (registerUser) {
                registerUser.addEventListener('input', () => {
                    this.clearFieldError(registerUser);
                    if (registerUser.value && !Validation.validateUsername(registerUser.value)) {
                        this.showFieldError(registerUser, 'Minimo 3 caracteres');
                    }
                });
            }

            if (registerEmail) {
                registerEmail.addEventListener('input', () => {
                    this.clearFieldError(registerEmail);
                    if (registerEmail.value && !Validation.validateEmail(registerEmail.value)) {
                        this.showFieldError(registerEmail, 'Email invalido');
                    }
                });
                registerEmail.addEventListener('blur', () => {
                    if (registerEmail.value && !Validation.validateEmail(registerEmail.value)) {
                        this.showFieldError(registerEmail, 'Email invalido');
                    }
                });
            }

            if (registerPassword) {
                registerPassword.addEventListener('input', () => {
                    this.clearFieldError(registerPassword);
                    if (registerPassword.value && !Validation.validatePassword(registerPassword.value)) {
                        this.showFieldError(registerPassword, 'Minimo 6 caracteres');
                    }
                });
            }
        },

        showFieldError(input, message) {
            input.classList.add('input-error');
            let errorSpan = input.parentElement.querySelector('.field-error');
            if (!errorSpan) {
                errorSpan = document.createElement('span');
                errorSpan.className = 'field-error';
                input.parentElement.appendChild(errorSpan);
            }
            errorSpan.textContent = message;
        },

        clearFieldError(input) {
            input.classList.remove('input-error');
            const errorSpan = input.parentElement.querySelector('.field-error');
            if (errorSpan) {
                errorSpan.remove();
            }
        },

        handleLoginSubmit(event) {
            event.preventDefault();
            const submitBtn = event.target.querySelector('button[type="submit"]');
            this.setButtonLoading(submitBtn, true);

            const emailInput = document.getElementById('loginEmail');
            const passwordInput = document.getElementById('loginPassword');

            if (!emailInput || !passwordInput) {
                Message.show('Erro nos campos do formulario.', 'error');
                this.setButtonLoading(submitBtn, false);
                return;
            }

            const email = emailInput.value.trim();
            const password = passwordInput.value;

            this.clearFieldError(emailInput);
            this.clearFieldError(passwordInput);

            let hasError = false;

            if (!email) {
                this.showFieldError(emailInput, 'Email e obrigatorio');
                hasError = true;
            } else if (!Validation.validateEmail(email)) {
                this.showFieldError(emailInput, 'Email invalido');
                hasError = true;
            }

            if (!password) {
                this.showFieldError(passwordInput, 'Senha e obrigatoria');
                hasError = true;
            }

            if (hasError) {
                Message.show('Por favor, corrija os campos destacados.', 'error');
                this.setButtonLoading(submitBtn, false);
                return;
            }

            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler((response) => {
                        this.handleLoginResponse(response);
                        this.setButtonLoading(submitBtn, false);
                    })
                    .withFailureHandler((error) => {
                        this.handleAuthFailure(error);
                        this.setButtonLoading(submitBtn, false);
                    })
                    .loginUser(email, password);
            } else {
                setTimeout(() => {
                    this.handleLoginResponse({ success: true, message: 'Login Simulado!', token: 'fake-token' });
                    this.setButtonLoading(submitBtn, false);
                }, 1000);
            }
        },

        handleLoginResponse(response) {
            Loading.hide();
            if (response.success && response.token) {
                sessionStorage.setItem('sco_token', response.token);
                window.location.href = '/?token=' + response.token;
            } else {
                Message.show(response.message, 'error');
            }
        },

        handleRegisterSubmit(event) {
            event.preventDefault();
            const submitBtn = event.target.querySelector('button[type="submit"]');
            this.setButtonLoading(submitBtn, true);

            const usernameInput = document.getElementById('registerUser');
            const emailInput = document.getElementById('registerEmail');
            const passwordInput = document.getElementById('registerPassword');

            if (!usernameInput || !emailInput || !passwordInput) {
                Message.show('Erro nos campos de formulario.', 'error');
                this.setButtonLoading(submitBtn, false);
                return;
            }

            const username = usernameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            this.clearFieldError(usernameInput);
            this.clearFieldError(emailInput);
            this.clearFieldError(passwordInput);

            let hasError = false;

            if (!username) {
                this.showFieldError(usernameInput, 'Nome de usuario e obrigatorio');
                hasError = true;
            } else if (!Validation.validateUsername(username)) {
                this.showFieldError(usernameInput, 'Minimo 3 caracteres');
                hasError = true;
            }

            if (!email) {
                this.showFieldError(emailInput, 'Email e obrigatorio');
                hasError = true;
            } else if (!Validation.validateEmail(email)) {
                this.showFieldError(emailInput, 'Email invalido');
                hasError = true;
            }

            if (!password) {
                this.showFieldError(passwordInput, 'Senha e obrigatoria');
                hasError = true;
            } else if (!Validation.validatePassword(password)) {
                this.showFieldError(passwordInput, 'Minimo 6 caracteres');
                hasError = true;
            }

            if (hasError) {
                Message.show('Por favor, corrija os campos destacados.', 'error');
                this.setButtonLoading(submitBtn, false);
                return;
            }

            if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler((response) => {
                        this.handleRegisterResponse(response);
                        this.setButtonLoading(submitBtn, false);
                    })
                    .withFailureHandler((error) => {
                        this.handleAuthFailure(error);
                        this.setButtonLoading(submitBtn, false);
                    })
                    .registerNewUser(username, email, password);
            } else {
                setTimeout(() => {
                    this.handleRegisterResponse({ success: true, message: 'Registro simulado!' });
                    this.setButtonLoading(submitBtn, false);
                }, 1000);
            }
        },

        handleRegisterResponse(response) {
            Loading.hide();
            if (response.success) {
                Message.show(response.message, 'success');
                const registerForm = document.getElementById('registerForm');
                if (registerForm) {
                    registerForm.reset();
                }
                setTimeout(() => {
                    const container = document.querySelector('.container');
                    if (container) {
                        container.classList.remove('active');
                    }
                }, 2000);
            } else {
                Message.show(response.message, 'error');
            }
        },

        handleAuthFailure(error) {
            Loading.hide();
            console.error('Erro na comunicacao com o servidor:', error);
            Message.show('Ocorreu um erro. Por favor, tente novamente mais tarde.', 'error');
        },

        setButtonLoading(button, isLoading) {
            if (!button) return;
            
            if (isLoading) {
                button.disabled = true;
                button.dataset.originalText = button.textContent;
                button.textContent = 'Aguarde...';
                button.classList.add('btn-loading');
            } else {
                button.disabled = false;
                button.textContent = button.dataset.originalText || button.textContent;
                button.classList.remove('btn-loading');
            }
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        Auth.init();
        Loading.hide();
    });
</script>
```

### 3.3 `js_app.html`

```html
<script>
    const App = {
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

        redirectToLogin() {
            window.location.href = '/';
        },

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

        initNavbarLogic() {
            const navToggle = document.getElementById('navToggle');
            const navMenu = document.getElementById('navMenu');
            
            if (navToggle && navMenu) {
                navToggle.addEventListener('click', () => {
                    navMenu.classList.toggle('show');
                    navToggle.classList.toggle('active');
                });
            }

            const dropdowns = document.querySelectorAll('.nav-item.dropdown > a');
            dropdowns.forEach(dropdown => {
                dropdown.addEventListener('click', (e) => {
                    if (window.innerWidth <= 768) {
                        e.preventDefault();
                        const parent = dropdown.parentElement;
                        if (parent) {
                            parent.classList.toggle('open');
                        }
                    }
                });
            });
        },

        bindLogout(token) {
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => {
                    Loading.show();
                    if (typeof google !== 'undefined' && google.script && google.script.run) {
                        google.script.run
                            .withSuccessHandler(() => {
                                sessionStorage.removeItem('sco_token');
                                window.location.href = '/';
                            })
                            .withFailureHandler(() => {
                                sessionStorage.removeItem('sco_token');
                                window.location.href = '/';
                            })
                            .logoutUser(token);
                    } else {
                        sessionStorage.removeItem('sco_token');
                        window.location.href = '/';
                    }
                });
            }
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        App.init();
        Loading.hide();
    });
</script>
```

### 3.4 `login.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SCO - Login</title>
    <link href="https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css" rel="stylesheet">
    <?!= include('styles'); ?>
</head>
<body>
    <div id="messageContainer" class="message-container" role="alert" aria-live="polite"></div>

    <div id="loginScreen">
        <div class="container">
            <div class="form-box login">
                <form id="loginForm" novalidate>
                    <h1>Login</h1>
                    <div class="input-box">
                        <label for="loginEmail" class="sr-only">E-mail</label>
                        <input type="email" id="loginEmail" placeholder="E-mail" autocomplete="email" aria-describedby="loginEmailHelp" required>
                        <i class="bx bxs-envelope" aria-hidden="true"></i>
                        <span id="loginEmailHelp" class="sr-only">Digite seu e-mail cadastrado</span>
                    </div>
                    <div class="input-box">
                        <label for="loginPassword" class="sr-only">Senha</label>
                        <input type="password" id="loginPassword" placeholder="Senha" autocomplete="current-password" required>
                        <i class="bx bxs-lock" aria-hidden="true"></i>
                    </div>
                    <div class="forget-password">
                        <input type="checkbox" id="showLoginPassword">
                        <label for="showLoginPassword">Visualizar senha</label>
                    </div>
                    <div class="forgot-link">
                        <a href="#" id="forgotPasswordLink">Esqueceu a senha?</a>
                    </div>
                    <button type="submit" class="btn" id="loginSubmitBtn">Login</button>
                </form>
            </div>

            <div class="form-box register">
                <form id="registerForm" novalidate>
                    <h1>Registrar</h1>
                    <div class="input-box">
                        <label for="registerUser" class="sr-only">Nome de Usuário</label>
                        <input type="text" id="registerUser" placeholder="Nome de Usuário" autocomplete="name" required>
                        <i class="bx bxs-user" aria-hidden="true"></i>
                    </div>
                    <div class="input-box">
                        <label for="registerEmail" class="sr-only">E-mail</label>
                        <input type="email" id="registerEmail" placeholder="E-mail" autocomplete="email" required>
                        <i class="bx bxs-envelope" aria-hidden="true"></i>
                    </div>
                    <div class="input-box">
                        <label for="registerPassword" class="sr-only">Senha</label>
                        <input type="password" id="registerPassword" placeholder="Senha" autocomplete="new-password" required>
                        <i class="bx bxs-lock" aria-hidden="true"></i>
                    </div>
                    <div class="forget-password">
                        <input type="checkbox" id="showRegisterPassword">
                        <label for="showRegisterPassword">Visualizar senha</label>
                    </div>
                    <button type="submit" class="btn" id="registerSubmitBtn">Registrar</button>
                </form>
            </div>

            <div class="togle-box">
                <div class="togle-panel togle-left">
                    <h1>Seja bem-vindo!</h1>
                    <p>Não tem uma conta?</p>
                    <button class="btn register-btn" type="button">Registrar</button>
                </div>
                <div class="togle-panel togle-right">
                    <h1>Você voltou!</h1>
                    <p>Você já tem uma conta?</p>
                    <button class="btn login-btn" type="button">Login</button>
                </div>
            </div>
        </div>
    </div>

    <?!= include('validacao'); ?>
    <?!= include('js_utils'); ?>
    <?!= include('loading'); ?>
    <?!= include('js_auth'); ?>
</body>
</html>
```

### 3.5 `app.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SCO - Controle de Serviços</title>
    <link href="https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css" rel="stylesheet">
    <?!= include('styles'); ?>
</head>
<body>
    <div id="appScreen" style="width: 100%;">
        <?!= include('navbar'); ?>
        <main class="app-content">
            <div class="welcome-card">
                <h2>Seja bem-vindo ao SCO!</h2>
                <p>Use o menu superior para navegar entre os cadastros e consultas do sistema de gerenciamento.</p>
            </div>
        </main>
    </div>

    <div id="messageContainer" class="message-container" role="alert" aria-live="polite"></div>

    <?!= include('loading'); ?>
    <?!= include('js_utils'); ?>
    <?!= include('js_app'); ?>
</body>
</html>
```

## Passo 4 — Remover arquivos obsoletos

```bash
rm Code.gs
rm javascript.html
rm index.html
```

Manter (sem alterações):
- `styles.html`
- `navbar.html`
- `loading.html`
- `validacao.html`

## Passo 5 — Implantar

```bash
clasp push
```

## Tree final esperada

```
projeto/
├── .clasp.json
├── appsscript.json
├── Config.gs            ← novo
├── SheetService.gs      ← novo
├── AuthService.gs       ← novo
├── SessionService.gs    ← novo
├── Main.gs              ← novo
├── login.html           ← novo
├── app.html             ← novo
├── js_utils.html        ← novo
├── js_auth.html         ← novo
├── js_app.html          ← novo
├── styles.html          ← mantido
├── navbar.html          ← mantido
├── loading.html         ← mantido
└── validacao.html       ← mantido
```
