/**
 * Entry point do Web App: roteia para login.html ou app.html baseado na validade do token.
 * Logs de diagnóstico ajudam rastrear fluxo de autenticação no Cloud Logging.
 * @param {Object} e Evento doGet (contém e.parameter.token)
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Template renderizado
 */
function doGet(e) {
    var token = e && e.parameter && e.parameter.token;
    console.log('[doGet] token param:', token ? token.substring(0, 8) + '...' : 'null');

    if (token) {
        var email = validateSession(token);
        console.log('[doGet] validateSession returned email:', email || 'null');
        if (email) {
            return HtmlService.createTemplateFromFile('app').evaluate();
        } else {
            // Token inválido ou expirado, limpar o token da URL e redirecionar para login.
            // Isso evita que o token inválido persista na URL.
            return HtmlService.createTemplateFromFile('login').evaluate();
        }
    }

    // Tenta obter o token do sessionStorage para evitar redirecionamento excessivo.
    // Note: Isso só funciona se o token já estiver sido salvo no cliente e a página for recarregada sem o token na URL.
    // Em um ambiente de Web App do Apps Script, a comunicação entre o cliente e o servidor é mais controlada.
    // O `doGet` é executado no servidor. O cliente deve lidar com a presença/ausência do token.
    // Este bloco pode ser redundante ou até problemático dependendo do fluxo exato de deploy.
    // Por enquanto, vamos manter a lógica baseada apenas no parâmetro da URL para consistência com GAS.

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
