/**
 * Code.js
 *
 * Entry point do Apps Script. Concentra:
 *   1. Configuracao (SHEETS_ID lido de PropertiesService, salt, nome da aba)
 *   2. Helpers de acesso a dados (getUsersSheet, hashPassword, findUserByEmail)
 *   3. Endpoints de template HTML (doGet, include)
 *
 * Logica de autenticacao/registro/rate-limit foi movida para AuthService.js.
 * Logica de perfil de usuario e gerenciada em UserService.js.
 *
 * No Apps Script todos os arquivos .js sao convertidos para .gs no push
 * via clasp e compartilham o mesmo escopo global, por isso as funcoes
 * declaradas em AuthService.js e UserService.js sao acessiveis daqui
 * (e do frontend via google.script.run) sem importacao explicita.
 */

// =================== Configuracao ===================

const SHEETS_ID = PropertiesService.getScriptProperties().getProperty('SHEETS_ID');

// Verificacao explicita para falhar cedo caso a propriedade nao esteja setada.
if (!SHEETS_ID) {
    throw new Error(
        'Por favor, configure a propriedade do script SHEETS_ID com o ID da sua planilha.',
    );
}

const SHEET_NAME = 'Usuarios';
const SALT =
    PropertiesService.getScriptProperties().getProperty('PASSWORD_SALT') || 'SCO_Salt_2024_v1';

// =================== Entry points HTML ===================

/**
 * Renderiza o template index.html servindo a pagina requisitada.
 * Por enquanto o parametro `page` ainda nao e usado (a modularizacao
 * das parciais/login-registro ocorre na ETAPA 2).
 * @param {GoogleAppsScript.Events.DoGet} e Evento de requisicao.
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
    return HtmlService.createTemplateFromFile('index').evaluate();
}

/**
 * Utilitario usado pelos templates HTML para incluir o conteudo bruto
 * de um arquivo como parcial.
 * @param {string} filename Nome do arquivo (sem extensao).
 * @returns {string} Conteudo HTML do arquivo.
 */
function include(filename) {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// =================== Helpers de acesso a dados ===================

/**
 * Obtem (e cria, se necessario) a aba de usuarios na planilha configurada.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getUsersSheet() {
    try {
        const spreadsheet = SpreadsheetApp.openById(SHEETS_ID);
        let sheet = spreadsheet.getSheetByName(SHEET_NAME);

        if (!sheet) {
            sheet = spreadsheet.insertSheet(SHEET_NAME);
            sheet
                .getRange(1, 1, 1, 6)
                .setValues([
                    [
                        'Email',
                        'Username',
                        'PasswordHash',
                        'CreatedDate',
                        'Status',
                        'LastLoginAttempt',
                    ],
                ]);
            sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
            sheet.getRange(1, 1, 1, 6).setBackground('#e8e8e8');
        }

        return sheet;
    } catch (error) {
        console.error('Erro ao acessar a planilha de usuarios:', error);
        throw new Error('Erro ao acessar o banco de dados de usuarios.');
    }
}

/**
 * Gera hash SHA-256 de uma senha concatenada com o SALT.
 * @param {string} password Senha em texto puro.
 * @returns {string} Hash hexadecimal.
 */
function hashPassword(password) {
    }

    try {
        const user = findUserByEmail(email);
        if (!user) {
            return { blocked: false };
        }

        const now = new Date().getTime();
        const lastAttempt = user.lastLoginAttempt || 0;

        if (lastAttempt > 0 && now - lastAttempt < LOCKOUT_DURATION_MS) {
            const lockoutEnd = new Date(lastAttempt + LOCKOUT_DURATION_MS);
            const remainingMinutes = Math.ceil((lockoutEnd.getTime() - now) / 60000);
            return {
                blocked: true,
                message: `Conta temporariamente bloqueada. Tente novamente em ${remainingMinutes} minutos.`,
            };
        }

        return { blocked: false };
    } finally {
        lock.releaseLock();
    }
}

function processLogin(email, password) {
    try {
        if (!email || !password) {
            return { success: false, message: 'Email e senha são obrigatórios.' };
        }

        const rateCheck = checkRateLimit(email);
        if (rateCheck.blocked) {
            return { success: false, message: rateCheck.message };
        }

        const user = findUserByEmail(email);

        if (!user) {
            return { success: false, message: 'Email ou senha incorretos.' };
        }

        if (!user.status) {
            return {
                success: false,
                message: 'Sua conta está desativada. Entre em contato com o administrador.',
            };
        }

        const providedHash = hashPassword(password);
        if (providedHash === user.passwordHash) {
            resetLoginAttempts(email);
            console.log('Login bem-sucedido para:', email);
            return { success: true, message: 'Login bem-sucedido!' };
        } else {
            recordFailedLoginAttempt(email);
            return { success: false, message: 'Email ou senha incorretos.' };
        }
    } catch (error) {
        console.error('Erro durante o login:', error);
        return { success: false, message: 'Ocorreu um erro durante o login. Tente novamente.' };
    }
}

function recordFailedLoginAttempt(email) {
    try {
        const lock = LockService.getScriptLock();
        lock.tryLock(LOCK_TIMEOUT_MS);

        if (!lock.hasLock()) return;

        const sheet = getUsersSheet();
        const data = sheet.getDataRange().getValues();

        for (let i = 1; i < data.length; i++) {
            if (data[i][0] === email) {
                sheet.getRange(i + 1, 6).setValue(new Date().getTime());

                const failedAttempts = sheet.getRange(i + 1, 7, 1, 1).getValue() || 0;
                sheet.getRange(i + 1, 7).setValue(failedAttempts + 1);

                if (failedAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
                    sheet.getRange(i + 1, 5).setValue(false);
                    console.log('Usuário bloqueado por exceder tentativas:', email);
                }
                break;
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
        const sheet = getUsersSheet();
        const data = sheet.getDataRange().getValues();

        for (let i = 1; i < data.length; i++) {
            if (data[i][0] === email) {
                sheet.getRange(i + 1, 6).setValue(0);
                sheet.getRange(i + 1, 7).setValue(0);
                break;
            }
        }
    } catch (error) {
        console.error('Erro ao resetar tentativas:', error);
    }
}

function registerUser(username, email, password) {
    try {
        if (!username || !email || !password) {
            return { success: false, message: 'Todos os campos são obrigatórios.' };
        }

        if (username.length < 3) {
            return {
                success: false,
                message: 'O nome de usuário deve ter pelo menos 3 caracteres.',
            };
        }

        const emailRegex =
            /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
        if (!emailRegex.test(email)) {
            return { success: false, message: 'Por favor, insira um e-mail válido.' };
        }

        if (password.length < 6) {
            return { success: false, message: 'A senha deve ter pelo menos 6 caracteres.' };
        }

        const existingUser = findUserByEmail(email);
        if (existingUser) {
            return { success: false, message: 'Este email já está registrado.' };
        }

        const passwordHash = hashPassword(password);
        const createdDate = new Date().toISOString();
        const status = false;

        const sheet = getUsersSheet();
        sheet.appendRow([email, username, passwordHash, createdDate, status, 0, 0]);

        console.log('Novo usuário registrado (aguardando ativação):', email);
        return {
            success: true,
            message: 'Registro bem-sucedido! Aguarde a ativação da sua conta pelo administrador.',
        };
    } catch (error) {
        console.error('Erro durante o registro:', error);
        return { success: false, message: 'Ocorreu um erro durante o registro. Tente novamente.' };
    }
}
