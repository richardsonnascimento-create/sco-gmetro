// ID da planilha Google Sheets onde os usuários são armazenados
const SHEETS_ID = '1h165109iAmNPcHra4AxUAiTen7c6eRrgmP6m2zc90co';
const SHEET_NAME = 'Usuarios'; // Nome da aba na planilha

/**
 * Função principal para servir a página HTML.
 * @param {Object} request O objeto de solicitação do Apps Script.
 * @returns {HtmlOutput} Um objeto HtmlOutput contendo o HTML renderizado.
 */
function doGet(request) {
  return HtmlService.createTemplateFromFile('index').evaluate();
}

/**
 * Inclui um arquivo HTML como um parcial.
 * Esta função é usada dentro de arquivos HTML com scriptlets.
 * Ex: `<?!= include('nome_do_arquivo'); ?>`
 * @param {string} filename O nome do arquivo HTML a ser incluído (sem a extensão .html).
 * @returns {string} O conteúdo do arquivo HTML especificado.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Obtém a referência da planilha de usuários.
 * @returns {Sheet} A aba de usuários da planilha.
 */
function getUsersSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SHEETS_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    // Se a aba não existe, cria uma nova com cabeçalhos
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      // Headers: Email, Username, PasswordHash, CreatedDate, Status
      sheet.getRange(1, 1, 1, 5).setValues([['Email', 'Username', 'PasswordHash', 'CreatedDate', 'Status']]);
      sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    }
    
    return sheet;
  } catch (error) {
    console.error('Erro ao acessar a planilha de usuários:', error);
    throw new Error('Erro ao acessar o banco de dados de usuários.');
  }
}

/**
 * Gera um hash simples para a senha (usando Utilities.computeDigest).
 * @param {string} password A senha a ser processada.
 * @returns {string} O hash da senha em formato hexadecimal.
 */
function hashPassword(password) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  let hashString = '';
  for (let i = 0; i < digest.length; i++) {
    const byte = digest[i];
    const byteStr = (byte < 0 ? 256 + byte : byte).toString(16);
    hashString += ('0' + byteStr).slice(-2);
  }
  return hashString;
}

/**
 * Localiza um usuário na planilha por email.
 * @param {string} email O email do usuário.
 * @returns {Object|null} Objeto do usuário ou null se não encontrado.
 */
function findUserByEmail(email) {
  try {
    const sheet = getUsersSheet();
    const data = sheet.getDataRange().getValues();
    
    // Pula a primeira linha (cabeçalho)
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === email) {
        return {
          email: data[i][0],
          username: data[i][1],
          passwordHash: data[i][2],
          createdDate: data[i][3],
          status: data[i][4] || 'Não', // Status do usuário (Sim/Não)
          rowIndex: i + 1 // Para atualizar depois se necessário
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Erro ao procurar usuário:', error);
    return null;
  }
}

/**
 * Processa as credenciais de login validando contra a planilha.
 * @param {string} email O email do usuário.
 * @param {string} password A senha do usuário.
 * @returns {Object} Um objeto contendo o status da autenticação e uma mensagem.
 */
function processLogin(email, password) {
  try {
    // Valida email e senha
    if (!email || !password) {
      return { success: false, message: 'Email e senha são obrigatórios.' };
    }
    
    // Procura o usuário na planilha
    const user = findUserByEmail(email);
    
    if (!user) {
      return { success: false, message: 'Email ou senha incorretos.' };
    }
    
    // Verifica se o usuário está ativo
    if (user.status !== 'Sim') {
      return { success: false, message: 'Sua conta está desativada. Entre em contato com o administrador.' };
    }
    
    // Compara o hash da senha fornecida com o hash armazenado
    const providedHash = hashPassword(password);
    if (providedHash === user.passwordHash) {
      console.log('Login bem-sucedido para:', email);
      return { success: true, message: 'Login bem-sucedido!' };
    } else {
      return { success: false, message: 'Email ou senha incorretos.' };
    }
  } catch (error) {
    console.error('Erro durante o login:', error);
    return { success: false, message: 'Ocorreu um erro durante o login. Tente novamente.' };
  }
}

/**
 * Registra um novo usuário na planilha.
 * @param {string} username O nome de usuário.
 * @param {string} email O email do usuário.
 * @param {string} password A senha do usuário (será armazenada como hash).
 * @returns {Object} Um objeto contendo o status do registro e uma mensagem.
 */
function registerUser(username, email, password) {
  try {
    // Validações básicas
    if (!username || !email || !password) {
      return { success: false, message: 'Todos os campos são obrigatórios.' };
    }
    
    if (username.length < 3) {
      return { success: false, message: 'O nome de usuário deve ter pelo menos 3 caracteres.' };
    }
    
    // Valida email com regex simples
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { success: false, message: 'Por favor, insira um e-mail válido.' };
    }
    
    if (password.length < 6) {
      return { success: false, message: 'A senha deve ter pelo menos 6 caracteres.' };
    }
    
    // Verifica se o email já existe
    const existingUser = findUserByEmail(email);
    if (existingUser) {
      return { success: false, message: 'Este email já está registrado.' };
    }
    
    // Hash da senha
    const passwordHash = hashPassword(password);
    const createdDate = new Date().toISOString();
    const status = 'Não'; // Novo usuário começa como inativo
    
    // Adiciona o novo usuário à planilha
    const sheet = getUsersSheet();
    sheet.appendRow([email, username, passwordHash, createdDate, status]);
    
    console.log('Novo usuário registrado (aguardando ativação):', email);
    return { success: true, message: 'Registro bem-sucedido! Aguarde a ativação da sua conta pelo administrador.' };
  } catch (error) {
    console.error('Erro durante o registro:', error);
    return { success: false, message: 'Ocorreu um erro durante o registro. Tente novamente.' };
  }
}
