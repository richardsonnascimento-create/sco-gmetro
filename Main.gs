/**
 * Entry point do Web App: roteia conforme token.
 *   ?token=xxx → app.html (se token válido)
 *   sem token  → login.html
 * A tela de admin é carregada na mesma página via google.script.run (sem redirecionamento).
 * @param {Object} e Evento doGet (contém e.parameter.token)
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Template renderizado
 */
function doGet(e) {
    var token = e && e.parameter && e.parameter.token;
    console.log('[doGet] token:', token ? token.substring(0, 8) + '...' : 'null');

    if (token) {
        var email = validateSession(token);
        console.log('[doGet] validateSession returned email:', email || 'null');

        if (email) {
            return HtmlService.createTemplateFromFile('app').evaluate();
        }
    }

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

/**
 * Retorna o email do usuário logado a partir do token.
 * Exposto via google.script.run.getCurrentUser(token).
 * @param {string} token UUID da sessão
 * @returns {Object} {email: string} ou {error: string}
 */
function getCurrentUser(token) {
    var email = validateSession(token);
    if (email) {
        return { email: email };
    }
    return { error: 'Sessao invalida ou expirada.' };
}

/**
 * Verifica se o usuário do token é administrador.
 * Exposto via google.script.run.isAdmin(token).
 * @param {string} token UUID da sessão
 * @returns {Object} {isAdmin: boolean, email?: string}
 */
function isAdmin(token) {
    var email = validateSession(token);
    if (!email) {
        return { isAdmin: false };
    }
    var user = findUserByEmail(email);
    return {
        isAdmin: !!(user && user.isAdmin),
        email: email,
    };
}

/**
 * Retorna todos os usuários (apenas admin).
 * Valida token e permissão de admin antes de chamar SheetService.
 * Exposto via google.script.run.getUsers(token).
 * @param {string} token UUID da sessão
 * @returns {Array|Object} Array de usuários ou {error: string}
 */
function getUsers(token) {
    var email = validateSession(token);
    if (!email) {
        return { error: 'Sessao invalida.' };
    }
    var user = findUserByEmail(email);
    if (!user || !user.isAdmin) {
        return { error: 'Acesso negado. Apenas administradores podem listar usuarios.' };
    }
    return getAllUsers();
}

/**
 * Atualiza status e módulos de um usuário (apenas admin).
 * Valida token e permissão de admin antes de chamar SheetService.
 * Exposto via google.script.run.updateUser(token, email, status, modulos).
 * @param {string} token UUID da sessão do admin
 * @param {string} targetEmail Email do usuário a atualizar
 * @param {string} status Novo status ("pendente", "aprovado", "rejeitado")
 * @param {string} modulos Módulos separados por vírgula
 * @returns {Object} {success: boolean, message: string}
 */
function updateUser(token, targetEmail, status, modulos) {
    var email = validateSession(token);
    if (!email) {
        return { success: false, message: 'Sessao invalida.' };
    }
    var user = findUserByEmail(email);
    if (!user || !user.isAdmin) {
        return { success: false, message: 'Acesso negado. Apenas administradores.' };
    }
    if (!targetEmail) {
        return { success: false, message: 'Email do usuario nao informado.' };
    }
    var updated = updateUserFields(targetEmail, status, modulos);
    if (updated) {
        return { success: true, message: 'Usuario atualizado com sucesso.' };
    }
    return { success: false, message: 'Usuario nao encontrado.' };
}

/**
 * Endpoint: insere novo proprietário (requer sessão válida).
 * Exposto via google.script.run.inserirProprietarioEndpoint(token, dados).
 * @param {string} token UUID da sessão
 * @param {Object} dados Dados do proprietário (exceto id)
 * @returns {Object} {success: boolean, message: string, id?: number}
 */
function inserirProprietarioEndpoint(token, dados) {
    var email = validateSession(token);
    if (!email) return { success: false, message: 'Sessao invalida.' };
    try {
        var id = inserirProprietario(dados);
        return { success: true, message: 'Proprietario cadastrado com sucesso.', id: id };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

/**
 * Endpoint: atualiza proprietário existente (requer sessão válida).
 * Exposto via google.script.run.atualizarProprietarioEndpoint(token, id, dados).
 * @param {string} token UUID da sessão
 * @param {number} id ID do proprietário
 * @param {Object} dados Novos dados
 * @returns {Object} {success: boolean, message: string}
 */
function atualizarProprietarioEndpoint(token, id, dados) {
    var email = validateSession(token);
    if (!email) return { success: false, message: 'Sessao invalida.' };
    try {
        atualizarProprietario(id, dados);
        return { success: true, message: 'Proprietario atualizado com sucesso.' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

/**
 * Endpoint: exclui proprietário (requer sessão válida).
 * Exposto via google.script.run.excluirProprietarioEndpoint(token, id).
 * @param {string} token UUID da sessão
 * @param {number} id ID do proprietário
 * @returns {Object} {success: boolean, message: string}
 */
function excluirProprietarioEndpoint(token, id) {
    var email = validateSession(token);
    if (!email) return { success: false, message: 'Sessao invalida.' };
    try {
        excluirProprietario(id);
        return { success: true, message: 'Proprietario excluido com sucesso.' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

/**
 * Endpoint: lista todos os proprietários (requer sessão válida).
 * Exposto via google.script.run.listarProprietariosEndpoint(token).
 * @param {string} token UUID da sessão
 * @returns {Array|Object} Array de proprietários ou {error: string}
 */
function listarProprietariosEndpoint(token) {
    var email = validateSession(token);
    if (!email) {
        console.log('[listarProprietariosEndpoint] token invalido');
        return { error: 'Sessao invalida.' };
    }
    console.log('[listarProprietariosEndpoint] token valido, chamando servico');
    try {
        return listarProprietarios();
    } catch (error) {
        console.log('[listarProprietariosEndpoint] erro:', error.message);
        return { error: error.message };
    }
}

/**
 * Endpoint: busca proprietário por ID (requer sessão válida).
 * Exposto via google.script.run.buscarProprietarioEndpoint(token, id).
 * @param {string} token UUID da sessão
 * @param {number} id ID do proprietário
 * @returns {Object} Dados do proprietário ou {error: string}
 */
function buscarProprietarioEndpoint(token, id) {
    var email = validateSession(token);
    if (!email) return { error: 'Sessao invalida.' };
    console.log('[buscarProprietarioEndpoint] buscando ID:', id);
    try {
        var proprietario = buscarProprietarioPorId(id);
        if (!proprietario) return { error: 'Proprietario nao encontrado.' };
        console.log('[buscarProprietarioEndpoint] encontrado:', proprietario.razaoSocial);
        return proprietario;
    } catch (error) {
        console.log('[buscarProprietarioEndpoint] erro:', error.message);
        return { error: error.message };
    }
}

/**
 * Endpoint: exporta proprietários como CSV (requer sessão válida).
 * Se search for informado, filtra os resultados.
 * Exposto via google.script.run.exportarProprietariosCSVEndpoint(token, search).
 * @param {string} token UUID da sessão
 * @param {string} search Termo opcional de filtro
 * @returns {Object} {success: boolean, csv?: string, message?: string}
 */
function exportarProprietariosCSVEndpoint(token, search) {
    var email = validateSession(token);
    if (!email) return { success: false, message: 'Sessao invalida.' };
    console.log('[exportarProprietariosCSVEndpoint] search:', search || '(todos)');
    try {
        var csv = gerarCSVProprietarios(search);
        if (csv.indexOf('Erro') === 0) {
            return { success: false, message: csv };
        }
        return { success: true, csv: csv };
    } catch (error) {
        console.error('[exportarProprietariosCSVEndpoint] erro:', error.message);
        return { success: false, message: error.message };
    }
}

/**
 * Endpoint: consulta CNPJ na ReceitaWS (requer sessão válida).
 * Exposto via google.script.run.consultarCnpjEndpoint(token, cnpj).
 * @param {string} token UUID da sessão
 * @param {string} cnpj CNPJ com ou sem máscara
 * @returns {Object} Dados mapeados do proprietário ou {error: string}
 */
function consultarCnpjEndpoint(token, cnpj) {
    var email = validateSession(token);
    if (!email) return { error: 'Sessao invalida.' };
    console.log('[consultarCnpjEndpoint] CNPJ:', cnpj ? cnpj.substring(0, 6) + '...' : 'null');
    try {
        return consultarCNPJ(cnpj);
    } catch (error) {
        console.error('[consultarCnpjEndpoint] erro:', error.message);
        return { error: error.message };
    }
}

/**
 * Endpoint: consulta municipio na base SGI (requer sessão válida).
 * Exposto via google.script.run.consultarMunicipioEndpoint(token, municipio).
 * @param {string} token UUID da sessão
 * @param {string} municipio Nome do municipio digitado
 * @returns {Object} {regional, sigla, codigoMunicipio} ou {error: string}
 */
function consultarMunicipioEndpoint(token, municipio) {
    var email = validateSession(token);
    if (!email) return { error: 'Sessao invalida.' };
    console.log('[consultarMunicipioEndpoint] municipio:', municipio);
    try {
        return consultarMunicipio(municipio);
    } catch (error) {
        console.error('[consultarMunicipioEndpoint] erro:', error.message);
        return { error: error.message };
    }
}

/**
 * Endpoint: consulta dados do CNPJ na Receita para conferencia.
 * Exposto via google.script.run.conferirProprietarioEndpoint(token, cnpj).
 * Reutiliza a funcao consultarCNPJ() existente.
 * @param {string} token UUID da sessão
 * @param {string} cnpj CNPJ com ou sem máscara
 * @returns {Object} Dados do proprietário ou {error: string}
 */
function conferirProprietarioEndpoint(token, cnpj) {
    var email = validateSession(token);
    if (!email) return { error: 'Sessao invalida.' };
    console.log('[conferirProprietarioEndpoint] CNPJ:', cnpj ? cnpj.substring(0, 6) + '...' : 'null');
    try {
        return consultarCNPJ(cnpj);
    } catch (error) {
        console.error('[conferirProprietarioEndpoint] erro:', error.message);
        return { error: error.message };
    }
}

/**
 * Endpoint: retorna todos os instrumentos cadastrados.
 * Exposto via google.script.run.listarInstrumentosEndpoint(token).
 * @param {string} token UUID da sessão
 * @returns {Array|Object} Array de instrumentos ou {error: string}
 */
function listarInstrumentosEndpoint(token) {
    var email = validateSession(token);
    if (!email) return { error: 'Sessao invalida.' };
    try {
        return listarInstrumentos();
    } catch (error) {
        console.error('[listarInstrumentosEndpoint] erro:', error.message);
        return { error: error.message };
    }
}

/**
 * Endpoint: retorna escopos de um proprietário.
 * Exposto via google.script.run.listarEscoposPorProprietarioEndpoint(token, idProprietario).
 * @param {string} token UUID da sessão
 * @param {number} idProprietario ID do proprietário
 * @returns {Array|Object} Array de escopos ou {error: string}
 */
function listarEscoposPorProprietarioEndpoint(token, idProprietario) {
    var email = validateSession(token);
    if (!email) return { error: 'Sessao invalida.' };
    try {
        return listarEscoposPorProprietario(idProprietario);
    } catch (error) {
        console.error('[listarEscoposPorProprietarioEndpoint] erro:', error.message);
        return { error: error.message };
    }
}

/**
 * Endpoint: insere novo escopo para um proprietário.
 * Exposto via google.script.run.inserirEscopoEndpoint(token, idProprietario, codigoEscopo, codigoInstrumento, dadosExtras).
 * @param {string} token UUID da sessão
 * @param {number} idProprietario ID do proprietário
 * @param {string} codigoEscopo Código do escopo
 * @param {number} codigoInstrumento ID do instrumento
 * @param {string} dadosExtras JSON string com dados extras
 * @returns {Object} {success: boolean, message: string, id?: number}
 */
function inserirEscopoEndpoint(token, idProprietario, codigoEscopo, codigoInstrumento, dadosExtras) {
    var email = validateSession(token);
    if (!email) return { success: false, message: 'Sessao invalida.' };
    try {
        var id = inserirEscopo(idProprietario, codigoEscopo, codigoInstrumento, dadosExtras);
        return { success: true, message: 'Escopo cadastrado com sucesso.', id: id };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

/**
 * Endpoint: atualiza escopo existente.
 * Exposto via google.script.run.atualizarEscopoEndpoint(token, idEscopo, codigoEscopo, codigoInstrumento, dadosExtras).
 * @param {string} token UUID da sessão
 * @param {number} idEscopo ID do escopo
 * @param {string} codigoEscopo Novo código do escopo
 * @param {number} codigoInstrumento Novo ID do instrumento
 * @param {string} dadosExtras Novo JSON string de dados extras
 * @returns {Object} {success: boolean, message: string}
 */
function atualizarEscopoEndpoint(token, idEscopo, codigoEscopo, codigoInstrumento, dadosExtras) {
    var email = validateSession(token);
    if (!email) return { success: false, message: 'Sessao invalida.' };
    try {
        atualizarEscopo(idEscopo, codigoEscopo, codigoInstrumento, dadosExtras);
        return { success: true, message: 'Escopo atualizado com sucesso.' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

/**
 * Endpoint: exclui escopo.
 * Exposto via google.script.run.excluirEscopoEndpoint(token, idEscopo).
 * @param {string} token UUID da sessão
 * @param {number} idEscopo ID do escopo a excluir
 * @returns {Object} {success: boolean, message: string}
 */
function excluirEscopoEndpoint(token, idEscopo) {
    var email = validateSession(token);
    if (!email) return { success: false, message: 'Sessao invalida.' };
    try {
        excluirEscopo(idEscopo);
        return { success: true, message: 'Escopo excluido com sucesso.' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}
