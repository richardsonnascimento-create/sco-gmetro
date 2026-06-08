/**
 * Obtém (e cria, se necessário) a aba de usuários na planilha configurada.
 * Cria cabeçalho com 7 colunas se a aba não existir.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} Objeto Sheet da aba 'Usuarios'
 * @throws {Error} Se não conseguir acessar a planilha (propaga erro do SpreadsheetApp)
 */
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

/**
 * Busca usuário pelo email na planilha.
 * Usa getValues() (batch read) para evitar leitura célula a célula — cota de leitura é preservada.
 * @param {string} email Email a buscar
 * @returns {Object|null} Objeto com {email, username, passwordHash, createdDate, status, lastLoginAttempt, failedAttempts} ou null se não encontrado
 */
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

/**
 * Insere nova linha de usuário na planilha.
 * appendRow faz escrita em lote (batch write) — eficiente para cota de escrita.
 * @param {string} email Email do usuário
 * @param {string} username Nome de usuário
 * @param {string} passwordHash Hash SHA-256 da senha (já processado)
 * @param {boolean} status Status inicial da conta (false = pendente ativação)
 */
function addUserRow(email, username, passwordHash, status) {
    var sheet = getUsersSheet();
    var createdDate = new Date().toISOString();
    sheet.appendRow([email, username, passwordHash, createdDate, status, 0, 0]);
}

/**
 * Atualiza tentativas falhas e timestamp do último login.
 * Escrita pontual (setValue) nas colunas 6 e 7 — custo baixo por ser apenas 2 células.
 * @param {string} email Email do usuário
 * @param {number} attempts Número de tentativas falhas
 * @param {number} timestamp Timestamp Unix (ms) da última tentativa
 */
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

/**
 * Reseta tentativas falhas e timestamp (após login bem-sucedido).
 * Zera colunas 6 e 7 para permitir novas tentativas.
 * @param {string} email Email do usuário
 */
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