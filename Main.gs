/**
 * Entry point do Web App: roteia conforme token.
 *   ?token=xxx → app.html (se token válido)
 *   sem token  → login.html
 * A tela de admin é carregada na mesma página via google.script.run (sem redirecionamento).
 * @param {Object} e Evento doGet (contém e.parameter.token)
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Template renderizado
 */
function doGet(e) {
    var token = e && e.parameter && e.parameter.token;
    console.log('[doGet] token:', token ? token.substring(0, 8) + '...' : 'null');

    if (token) {
        var email = validateSession(token);
        console.log('[doGet] validateSession returned email:', email || 'null');

        if (email) {
            return HtmlService.createTemplateFromFile('app').evaluate();
        }
    }

    return HtmlService.createTemplateFromFile('login').evaluate();
}

/**
 * Helper para templates GAS: inclui conteúdo bruto de arquivo HTML como parcial.
 * Usado nos scriptlets: <?!= include('filename') ?>
 * @param {string} filename Nome do arquivo (sem extensão .html)
 * @returns {string} Conteúdo HTML do arquivo
 */
function include(filename) {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Endpoint público para login: wrapper semântico sobre AuthService.processLogin.
 * Exposto via google.script.run.loginUser(email, password).
 * @param {string} email Email
 * @param {string} password Senha
 * @returns {Object} {success: boolean, message: string, token?: string}
 */
function loginUser(email, password) {
    console.log('[loginUser] email:', email, 'passwordLength:', password ? password.length : 0);
    return processLogin(email, password);
}

/**
 * Endpoint público para registro: wrapper sobre AuthService.registerUser.
 * Exposto via google.script.run.registerNewUser(username, email, password).
 * @param {string} username Nome de usuário
 * @param {string} email Email
 * @param {string} password Senha
 * @returns {Object} {success: boolean, message: string}
 */
function registerNewUser(username, email, password) {
    return registerUser(username, email, password);
}

/**
 * Endpoint público para logout: destrói sessão no backend.
 * Exposto via google.script.run.logoutUser(token).
 * @param {string} token UUID da sessão
 */
function logoutUser(token) {
    destroySession(token);
}

/**
 * Endpoint público para validar sessão: usado pelo frontend app.html no carregamento.
 * Exposto via google.script.run.checkSession(token).
 * @param {string} token UUID da sessão
 * @returns {Object} {valid: boolean, email?: string}
 */
function checkSession(token) {
    console.log('[checkSession] token:', token ? token.substring(0, 8) + '...' : 'null');
    var email = validateSession(token);
    console.log('[checkSession] validateSession returned email:', email || 'null');
    if (email) {
        return { valid: true, email: email };
    }
    return { valid: false };
}

/**
 * Retorna o email do usuário logado a partir do token.
 * Exposto via google.script.run.getCurrentUser(token).
 * @param {string} token UUID da sessão
 * @returns {Object} {email: string} ou {error: string}
 */
function getCurrentUser(token) {
    var email = validateSession(token);
    if (email) {
        return { email: email };
    }
    return { error: 'Sessao invalida ou expirada.' };
}

/**
 * Verifica se o usuário do token é administrador.
 * Exposto via google.script.run.isAdmin(token).
 * @param {string} token UUID da sessão
 * @returns {Object} {isAdmin: boolean, email?: string}
 */
function isAdmin(token) {
    var email = validateSession(token);
    if (!email) {
        return { isAdmin: false };
    }
    var user = findUserByEmail(email);
    return {
        isAdmin: !!(user && user.isAdmin),
        email: email,
    };
}

/**
 * Retorna todos os usuários (apenas admin).
 * Valida token e permissão de admin antes de chamar SheetService.
 * Exposto via google.script.run.getUsers(token).
 * @param {string} token UUID da sessão
 * @returns {Array|Object} Array de usuários ou {error: string}
 */
function getUsers(token) {
    var email = validateSession(token);
    if (!email) {
        return { error: 'Sessao invalida.' };
    }
    var user = findUserByEmail(email);
    if (!user || !user.isAdmin) {
        return { error: 'Acesso negado. Apenas administradores podem listar usuarios.' };
    }
    return getAllUsers();
}

/**
 * Atualiza status e módulos de um usuário (apenas admin).
 * Valida token e permissão de admin antes de chamar SheetService.
 * Exposto via google.script.run.updateUser(token, email, status, modulos).
 * @param {string} token UUID da sessão do admin
 * @param {string} targetEmail Email do usuário a atualizar
 * @param {string} status Novo status ("pendente", "aprovado", "rejeitado")
 * @param {string} modulos Módulos separados por vírgula
 * @returns {Object} {success: boolean, message: string}
 */
function updateUser(token, targetEmail, status, modulos) {
    var email = validateSession(token);
    if (!email) {
        return { success: false, message: 'Sessao invalida.' };
    }
    var user = findUserByEmail(email);
    if (!user || !user.isAdmin) {
        return { success: false, message: 'Acesso negado. Apenas administradores.' };
    }
    if (!targetEmail) {
        return { success: false, message: 'Email do usuario nao informado.' };
    }
    var updated = updateUserFields(targetEmail, status, modulos);
    if (updated) {
        return { success: true, message: 'Usuario atualizado com sucesso.' };
    }
    return { success: false, message: 'Usuario nao encontrado.' };
}
