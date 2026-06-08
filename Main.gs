/**
 * Entry point do Web App: roteia para login.html ou app.html baseado na validade do token.
 * Logs de diagnóstico ajudam rastrear fluxo de autenticação no Cloud Logging.
 * @param {Object} e Evento doGet (contém e.parameter.token)
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Template renderizado
 */
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
    var email = validateSession(token);
    if (email) {
        return { valid: true, email: email };
    }
    return { valid: false };
}