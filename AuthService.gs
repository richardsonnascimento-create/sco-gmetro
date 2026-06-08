/**
 * Gera hash SHA-256 da senha concatenada com SALT.
 * Usa SHA-256 (não bcrypt/argon2) por limitação do GAS V8 sem libs nativas de KDF.
 * O SALT impede rainbow tables; armazenado em Script Properties (não hardcoded).
 * @param {string} password Senha em texto puro
 * @returns {string} Hash hexadecimal
 */
function hashPassword(password) {
    var raw = Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        password + SALT,
    );
    return raw.map(function (b) {
        return ('0' + (b & 0xFF).toString(16)).slice(-2);
    }).join('');
}

/**
 * Verifica se a conta está temporariamente bloqueada por excesso de tentativas.
 * Não usa LockService — leitura simples de timestamp/failedAttempts.
 * @param {string} email Email a verificar
 * @returns {Object} {blocked: boolean, message?: string}
 */
function checkAccountLockout(email) {
    var user = findUserByEmail(email);
    if (!user) return { blocked: false };

    var now = new Date().getTime();
    var lastAttempt = user.lastLoginAttempt || 0;

    if (lastAttempt > 0 && now - lastAttempt < LOCKOUT_DURATION_MS) {
        var lockoutEnd = new Date(lastAttempt + LOCKOUT_DURATION_MS);
        var remainingMinutes = Math.ceil((lockoutEnd.getTime() - now) / 60000);
        return {
            blocked: true,
            message: 'Conta temporariamente bloqueada. Tente novamente em ' + remainingMinutes + ' minutos.',
        };
    }

    return { blocked: false };
}

/**
 * Registra tentativa de login falha com LockService para concorrência.
 * Incrementa contador; se atingir MAX_LOGIN_ATTEMPTS, desativa conta (status=false).
 * Lock de 10s evita race condition entre requisições simultâneas.
 * @param {string} email Email do usuário
 */
function recordFailedLoginAttempt(email) {
    try {
        var lock = LockService.getScriptLock();
        lock.tryLock(10000);

        if (!lock.hasLock()) return;

        var user = findUserByEmail(email);
        if (!user) return;

        var attempts = (user.failedAttempts || 0) + 1;
        var now = new Date().getTime();

        updateFailedAttempt(email, attempts, now);

        if (attempts >= MAX_LOGIN_ATTEMPTS) {
            var sheet = getUsersSheet();
            var data = sheet.getDataRange().getValues();

            for (var i = 1; i < data.length; i++) {
                if (data[i][0] === email) {
                    sheet.getRange(i + 1, 5).setValue(false);
                    console.log('Usuario bloqueado por exceder tentativas:', email);
                    break;
                }
            }
        }
    } catch (error) {
        console.error('Erro ao registrar tentativa falhada:', error);
    } finally {
        lock.releaseLock();
    }
}

/**
 * Reseta tentativas falhas após login bem-sucedido.
 * Delega para SheetService.resetFailedAttempts (escrita pontual em 2 células).
 * @param {string} email Email do usuário
 */
function resetLoginAttempts(email) {
    try {
        resetFailedAttempts(email);
    } catch (error) {
        console.error('Erro ao resetar tentativas:', error);
    }
}

/**
 * Processa autenticação: valida credenciais, checa bloqueio, verifica hash, cria sessão.
 * Fluxo: valida inputs → checa lockout → busca usuário → verifica status string → compara hash →
 *   sucesso: reseta tentativas + cria sessão (token) | falha: registra tentativa.
 * Status possíveis: "pendente" (aguarda admin), "aprovado" (liberado), "rejeitado" (bloqueado).
 * @param {string} email Email do usuário
 * @param {string} password Senha em texto puro
 * @returns {Object} {success: boolean, message: string, token?: string}
 */
function processLogin(email, password) {
    try {
        if (!email || !password) {
            return { success: false, message: 'Email e senha sao obrigatorios.' };
        }

        var rateCheck = checkAccountLockout(email);
        if (rateCheck.blocked) {
            return { success: false, message: rateCheck.message };
        }

        var user = findUserByEmail(email);

        if (!user) {
            return { success: false, message: 'Email ou senha incorretos.' };
        }

        if (user.status === 'pendente') {
            return {
                success: false,
                message: 'Aguardando aprovacao do administrador.',
            };
        }

        if (user.status === 'rejeitado') {
            return {
                success: false,
                message: 'Conta bloqueada. Entre em contato com o administrador.',
            };
        }

        var providedHash = hashPassword(password);
        if (providedHash === user.passwordHash) {
            resetLoginAttempts(email);
            var token = createSession(email);
            console.log('Login bem-sucedido para:', email);
            return { success: true, message: 'Login bem-sucedido!', token: token };
        } else {
            recordFailedLoginAttempt(email);
            return { success: false, message: 'Email ou senha incorretos.' };
        }
    } catch (error) {
        console.error('Erro durante o login:', error);
        return { success: false, message: 'Ocorreu um erro durante o login. Tente novamente.' };
    }
}

/**
 * Registra novo usuário: valida inputs, checa duplicidade, hasha senha, insere na planilha.
 * Status inicial = false (aguarda ativação por admin).
 * Validações: username >= 3 chars, email regex RFC-compliant, password >= 6 chars.
 * @param {string} username Nome de usuário
 * @param {string} email Email
 * @param {string} password Senha em texto puro
 * @returns {Object} {success: boolean, message: string}
 */
function registerUser(username, email, password) {
    try {
        if (!username || !email || !password) {
            return { success: false, message: 'Todos os campos sao obrigatorios.' };
        }

        if (username.length < 3) {
            return {
                success: false,
                message: 'O nome de usuario deve ter pelo menos 3 caracteres.',
            };
        }

        var emailRegex =
            /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
        if (!emailRegex.test(email)) {
            return { success: false, message: 'Por favor, insira um e-mail valido.' };
        }

        if (password.length < 6) {
            return { success: false, message: 'A senha deve ter pelo menos 6 caracteres.' };
        }

        var existingUser = findUserByEmail(email);
        if (existingUser) {
            return { success: false, message: 'Este email ja esta registrado.' };
        }

        var passwordHash = hashPassword(password);
        addUserRow(email, username, passwordHash, false);

        console.log('Novo usuario registrado (aguardando ativacao):', email);
        return {
            success: true,
            message: 'Registro bem-sucedido! Aguarde a ativacao da sua conta pelo administrador.',
        };
    } catch (error) {
        console.error('Erro durante o registro:', error);
        return { success: false, message: 'Ocorreu um erro durante o registro. Tente novamente.' };
    }
}