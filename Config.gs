/**
 * Configurações globais do aplicativo.
 * Constantes centralizadas para evitar valores mágicos espalhados no código.
 * Valores sensíveis (SHEETS_ID, PASSWORD_SALT) ficam em Script Properties — nunca em código.
 */

var SHEETS_ID = PropertiesService.getScriptProperties().getProperty('SHEETS_ID');

if (!SHEETS_ID) {
    throw new Error(
        'Por favor, configure a propriedade do script SHEETS_ID com o ID da sua planilha.',
    );
}

/** Nome da aba na planilha onde os usuários são armazenados. */
var SHEET_NAME = 'Usuarios';

/**
 * Salt para hash de senhas. Armazenado em Script Properties para rotação sem deploy.
 * Fallback hardcoded apenas para compatibilidade com deployments antigos.
 */
var SALT =
    PropertiesService.getScriptProperties().getProperty('PASSWORD_SALT') || 'SCO_Salt_2024_v1';

/** Tempo de bloqueio após exceder tentativas de login (15 min). */
var LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/** Máximo de tentativas de login falhas antes de bloquear a conta. */
var MAX_LOGIN_ATTEMPTS = 5;

/** Chave no Script Properties para o mapa de tokens de sessão (token -> {email, createdAt}). */
var SESSION_TOKEN_PROPERTY = 'sessionTokens';
