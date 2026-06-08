/** Duração da sessão em ms (2 horas). PropertiesService persiste entre execuções, ao contrário de CacheService. */
var SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Cria nova sessão: gera UUID, armazena em Script Properties (map token -> {email, createdAt}).
 * PropertiesService preferido sobre CacheService pois persiste entre execuções e suporta objetos complexos via JSON.
 * @param {string} email Email do usuário autenticado
 * @returns {string} Token UUID da sessão
 */
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

/**
 * Valida sessão via token: lê do Script Properties, verifica existência e expiração (2h).
 * Remove token expirado automaticamente (limpeza preguiçosa).
 * @param {string} token UUID da sessão
 * @returns {string|null} Email do usuário ou null se inválido/expirado
 */
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

/**
 * Remove token do mapa de sessões no Script Properties (logout).
 * @param {string} token UUID da sessão
 */
function destroySession(token) {
    if (!token) return;

    var properties = PropertiesService.getScriptProperties();
    var sessionsJson = properties.getProperty(SESSION_TOKEN_PROPERTY);
    if (!sessionsJson) return;

    var sessions = JSON.parse(sessionsJson);
    delete sessions[token];
    properties.setProperty(SESSION_TOKEN_PROPERTY, JSON.stringify(sessions));
}

/**
 * Helper que retorna email se sessão válida, null caso contrário.
 * Wrapper semântico sobre validateSession.
 * @param {string} token UUID da sessão
 * @returns {string|null} Email ou null
 */
function getCurrentUserEmail(token) {
    return validateSession(token);
}