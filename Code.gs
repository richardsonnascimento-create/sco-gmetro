const SHEETS_ID = PropertiesService.getScriptProperties().getProperty('SHEETS_ID') || '1h165109iAmNPcHra4AxUAiTen7c6eRrgmP6m2zc90co';
const SHEET_NAME = 'Usuarios';
const SALT = PropertiesService.getScriptProperties().getProperty('PASSWORD_SALT') || 'SCO_Salt_2024_v1';
const LOCK_TIMEOUT_MS = 30000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

function doGet(request) {
  return HtmlService.createTemplateFromFile('index').evaluate();
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getUsersSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SHEETS_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, 6).setValues([['Email', 'Username', 'PasswordHash', 'CreatedDate', 'Status', 'LastLoginAttempt']]);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
      sheet.getRange(1, 1, 1, 6).setBackground('#e8e8e8');
    }
    
    return sheet;
  } catch (error) {
    console.error('Erro ao acessar a planilha de usuários:', error);
    throw new Error('Erro ao acessar o banco de dados de usuários.');
  }
}

function hashPassword(password) {
  const saltedPassword = SALT + password + SALT;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, saltedPassword);
  let hashString = '';
  for (let i = 0; i < digest.length; i++) {
    const byte = digest[i];
    const byteStr = (byte < 0 ? 256 + byte : byte).toString(16);
    hashString += ('0' + byteStr).slice(-2);
  }
  return hashString;
}

function findUserByEmail(email) {
  try {
    const sheet = getUsersSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === email) {
        return {
          email: data[i][0],
          username: data[i][1],
          passwordHash: data[i][2],
          createdDate: data[i][3],
          status: data[i][4] === true || data[i][4] === 'Sim' || data[i][4] === 'sim',
          lastLoginAttempt: data[i][5],
          rowIndex: i + 1
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Erro ao procurar usuário:', error);
    return null;
  }
}

function checkRateLimit(email) {
  const lock = LockService.getScriptLock();
  lock.tryLock(LOCK_TIMEOUT_MS);
  
  if (!lock.hasLock()) {
    return { blocked: true, message: 'Servidor ocupado. Tente novamente em alguns segundos.' };
  }
  
  try {
    const user = findUserByEmail(email);
    if (!user) {
      return { blocked: false };
    }
    
    const now = new Date().getTime();
    const lastAttempt = user.lastLoginAttempt || 0;
    
    if (lastAttempt > 0 && (now - lastAttempt) < LOCKOUT_DURATION_MS) {
      const lockoutEnd = new Date(lastAttempt + LOCKOUT_DURATION_MS);
      const remainingMinutes = Math.ceil((lockoutEnd.getTime() - now) / 60000);
      return { 
        blocked: true, 
        message: `Conta temporariamente bloqueada. Tente novamente em ${remainingMinutes} minutos.` 
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
      return { success: false, message: 'Sua conta está desativada. Entre em contato com o administrador.' };
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
      return { success: false, message: 'O nome de usuário deve ter pelo menos 3 caracteres.' };
    }
    
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
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
    return { success: true, message: 'Registro bem-sucedido! Aguarde a ativação da sua conta pelo administrador.' };
  } catch (error) {
    console.error('Erro durante o registro:', error);
    return { success: false, message: 'Ocorreu um erro durante o registro. Tente novamente.' };
  }
}