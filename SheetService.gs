/**
 * Obtém (e cria, se necessário) a aba de usuários na planilha configurada.
 * Se a aba existir com 7 colunas (schema antigo), executa migração automática para 9 colunas:
 *   - Converte Status de booleano para string (true → "aprovado", false → "pendente")
 *   - Adiciona colunas Modulos (H) e IsAdmin (I)
 *   - Cria usuário admin@meusistema.com se não existir
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} Objeto Sheet da aba 'Usuarios'
 * @throws {Error} Se não conseguir acessar a planilha (propaga erro do SpreadsheetApp)
 */
function getUsersSheet() {
    try {
        var spreadsheet = SpreadsheetApp.openById(SHEETS_ID);
        var sheet = spreadsheet.getSheetByName(SHEET_NAME);

        if (!sheet) {
            sheet = createNewUsersSheet(spreadsheet);
        } else if (sheet.getLastColumn() < 9) {
            sheet = migrateUsersSheet(sheet);
        }

        return sheet;
    } catch (error) {
        console.error('Erro ao acessar a planilha de usuarios:', error);
        throw new Error('Erro ao acessar o banco de dados de usuarios.');
    }
}

/**
 * Cria uma nova aba de usuários com schema de 9 colunas.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function createNewUsersSheet(spreadsheet) {
    var sheet = spreadsheet.insertSheet(SHEET_NAME);
    var headers = [
        'Email', 'Username', 'PasswordHash', 'CreatedDate',
        'Status', 'LastLoginAttempt', 'FailedAttempts',
        'Modulos', 'IsAdmin',
    ];
    sheet.getRange(1, 1, 1, 9).setValues([headers]);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    sheet.getRange(1, 1, 1, 9).setBackground('#e8e8e8');
    return sheet;
}

/**
 * Migra sheet de 7 colunas (antigo schema) para 9 colunas (novo schema).
 * Converte Status booleano → string e cria admin padrão se ausente.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function migrateUsersSheet(sheet) {
    var data = sheet.getDataRange().getValues();
    var newHeaders = [
        'Email', 'Username', 'PasswordHash', 'CreatedDate',
        'Status', 'LastLoginAttempt', 'FailedAttempts',
        'Modulos', 'IsAdmin',
    ];
    var newData = [newHeaders];

    for (var i = 1; i < data.length; i++) {
        var row = data[i];
        var oldStatus = row[4];
        var newStatus = oldStatus === true ? 'aprovado' : 'pendente';

        newData.push([
            row[0] || '',  // Email
            row[1] || '',  // Username
            row[2] || '',  // PasswordHash
            row[3] || '',  // CreatedDate
            newStatus,     // Status convertido para string
            row[5] || 0,   // LastLoginAttempt
            row[6] || 0,   // FailedAttempts
            '',            // Modulos (padrão vazio)
            false,         // IsAdmin (padrão false)
        ]);
    }

    sheet.clear();
    sheet.getRange(1, 1, newData.length, 9).setValues(newData);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    sheet.getRange(1, 1, 1, 9).setBackground('#e8e8e8');

    ensureAdminExists(sheet);

    return sheet;
}

/**
 * Garante que o usuário admin@meusistema.com exista com isAdmin=true e status "aprovado".
 * Se não existir, cria com senha padrão Admin@2024 e todos os módulos habilitados.
 * Se existir, garante que isAdmin=true e status="aprovado".
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function ensureAdminExists(sheet) {
    var data = sheet.getDataRange().getValues();
    var adminEmail = 'admin@meusistema.com';

    for (var i = 1; i < data.length; i++) {
        if (data[i][0] === adminEmail) {
            sheet.getRange(i + 1, 9).setValue(true);
            sheet.getRange(i + 1, 5).setValue('aprovado');
            console.log('Admin ja existente, isAdmin garantido:', adminEmail);
            return;
        }
    }

    var passwordHash = hashPassword('Admin@2024');
    var createdDate = new Date().toISOString();
    sheet.appendRow([
        adminEmail,
        'Administrador',
        passwordHash,
        createdDate,
        'aprovado',
        0,
        0,
        'Cadastro de Proprietário,Login,Serviços',
        true,
    ]);
    console.log('Usuario admin criado automaticamente:', adminEmail);
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
                modulos: data[i][7] || '',
                isAdmin: data[i][8] || false,
            };
        }
    }

    return null;
}

/**
 * Insere nova linha de usuário na planilha.
 * appendRow faz escrita em lote (batch write) — eficiente para cota de escrita.
 * As colunas Modulos e IsAdmin têm valores padrão para novos registros.
 * @param {string} email Email do usuário
 * @param {string} username Nome de usuário
 * @param {string} passwordHash Hash SHA-256 da senha (já processado)
 * @param {string} status Status inicial ("pendente", "aprovado" ou "rejeitado")
 * @param {string} [modulos] Módulos separados por vírgula (padrão "")
 * @param {boolean} [isAdmin] Se é administrador (padrão false)
 */
function addUserRow(email, username, passwordHash, status, modulos, isAdmin) {
    var sheet = getUsersSheet();
    var createdDate = new Date().toISOString();
    sheet.appendRow([
        email,
        username,
        passwordHash,
        createdDate,
        status || 'pendente',
        0,
        0,
        modulos || '',
        isAdmin || false,
    ]);
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

/**
 * Retorna todos os usuários cadastrados (exceto o admin na primeira chamada de setup).
 * Usado pela tela de administração para listar e gerenciar usuários.
 * @returns {Array<{email: string, username: string, status: string, modulos: string, isAdmin: boolean}>}
 */
function getAllUsers() {
    var sheet = getUsersSheet();
    var data = sheet.getDataRange().getValues();
    var users = [];

    for (var i = 1; i < data.length; i++) {
        users.push({
            email: data[i][0],
            username: data[i][1],
            status: data[i][4],
            modulos: data[i][7] || '',
            isAdmin: data[i][8] || false,
        });
    }

    return users;
}

/**
 * Atualiza status e módulos de um usuário (usado pelo admin).
 * Escrita direta nas colunas 5 (Status) e 8 (Modulos) da linha correspondente.
 * @param {string} email Email do usuário a atualizar
 * @param {string} status Novo status ("pendente", "aprovado", "rejeitado")
 * @param {string} modulos Módulos separados por vírgula
 * @returns {boolean} true se encontrou e atualizou, false se não encontrou
 */
function updateUserFields(email, status, modulos) {
    var sheet = getUsersSheet();
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
        if (data[i][0] === email) {
            sheet.getRange(i + 1, 5).setValue(status);
            sheet.getRange(i + 1, 8).setValue(modulos);
            console.log('Usuario atualizado:', email, 'Status:', status, 'Modulos:', modulos);
            return true;
        }
    }

    console.warn('Usuario nao encontrado para atualizacao:', email);
    return false;
}