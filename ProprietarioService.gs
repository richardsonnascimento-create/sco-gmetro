/**
 * Módulo de cadastro de proprietários.
 * Gerencia CRUD na aba "Proprietarios" da planilha DB_Principal.
 * Schema: idProprietario | razaoSocial | cnpjProprietario | logradouro | numero |
 *         complemento | CEP | bairro | municipio | UF | email | telefone |
 *         situacaoCadastral | CNAE | proprietario | autorizacao | regional |
 *         sigla | codigoMunicipio | observacaoProprietario
 */

var DB_Principal = PropertiesService.getScriptProperties().getProperty('ID_PRINCIPAL');

if (!DB_Principal) {
    throw new Error(
        'Propriedade ID_PRINCIPAL nao configurada. Defina o ID da planilha DB_Principal.',
    );
}

/** Nome da aba onde os proprietários são armazenados. */
var SHEET_NAME_PROPRIETARIOS = 'Proprietarios';

/**
 * Nomes das colunas na ordem exata do cabeçalho (índice 0 = idProprietario).
 * Usado para montar objetos de retorno e mapear índices.
 */
var COLUNAS_PROPRIETARIOS = [
    'idProprietario',
    'razaoSocial',
    'cnpjProprietario',
    'logradouro',
    'numero',
    'complemento',
    'CEP',
    'bairro',
    'municipio',
    'UF',
    'email',
    'telefone',
    'situacaoCadastral',
    'CNAE',
    'proprietario',
    'autorizacao',
    'regional',
    'sigla',
    'codigoMunicipio',
    'observacaoProprietario',
];

/**
 * Obtém (e cria, se necessário) a aba "Proprietarios" na planilha DB_Principal.
 * Se a aba não existir, cria com os cabeçalhos padrão.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} Objeto Sheet da aba 'Proprietarios'
 * @throws {Error} Se não conseguir acessar a planilha
 */
function getProprietariosSheet() {
    try {
        var spreadsheet = SpreadsheetApp.openById(DB_Principal);
        var sheet = spreadsheet.getSheetByName(SHEET_NAME_PROPRIETARIOS);

        if (!sheet) {
            sheet = spreadsheet.insertSheet(SHEET_NAME_PROPRIETARIOS);
            sheet.getRange(1, 1, 1, COLUNAS_PROPRIETARIOS.length).setValues([COLUNAS_PROPRIETARIOS]);
            sheet.getRange(1, 1, 1, COLUNAS_PROPRIETARIOS.length).setFontWeight('bold');
        }

        return sheet;
    } catch (error) {
        console.error('Erro ao acessar a planilha de proprietarios:', error);
        throw new Error('Erro ao acessar o banco de dados de proprietarios.');
    }
}

/**
 * Retorna o próximo ID numérico sequencial para uma aba da planilha DB_Principal.
 * Baseia-se no maior valor existente na coluna A (índice 0) da aba informada.
 * Se não houver dados (apenas cabeçalho), retorna 1.
 * @param {string} sheetName Nome da aba na planilha DB_Principal
 * @returns {number} Próximo ID disponível
 * @throws {Error} Se não conseguir acessar a planilha
 */
function getNextId(sheetName) {
    try {
        var spreadsheet = SpreadsheetApp.openById(DB_Principal);
        var sheet = spreadsheet.getSheetByName(sheetName);

        if (!sheet) {
            throw new Error('Aba "' + sheetName + '" nao encontrada.');
        }

        var data = sheet.getDataRange().getValues();

        if (data.length <= 1) {
            return 1;
        }

        var maxId = 0;
        for (var i = 1; i < data.length; i++) {
            var id = Number(data[i][0]);
            if (!isNaN(id) && id > maxId) {
                maxId = id;
            }
        }

        return maxId + 1;
    } catch (error) {
        console.error('Erro ao gerar proximo ID para aba ' + sheetName + ':', error);
        throw error;
    }
}

/**
 * Verifica se um CNPJ já existe na aba "Proprietarios".
 * Ignora a linha de cabeçalho (linha 1). Comparação exata com a coluna C (índice 2).
 * @param {string} cnpj CNPJ a verificar (string)
 * @returns {boolean} true se o CNPJ já estiver cadastrado, false caso contrário
 */
function cnpjJaExiste(cnpj) {
    try {
        var sheet = getProprietariosSheet();
        var data = sheet.getDataRange().getValues();

        for (var i = 1; i < data.length; i++) {
            if (String(data[i][2]) === String(cnpj)) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('Erro ao verificar CNPJ duplicado:', error);
        throw new Error('Erro ao verificar CNPJ.');
    }
}

/**
 * Insere um novo proprietário na aba "Proprietarios".
 * Valida duplicidade de CNPJ antes de inserir. Gera ID automaticamente.
 * Usa LockService para evitar duplicatas em requisições simultâneas.
 * @param {Object} dados Objeto com os campos do proprietário (exceto idProprietario)
 * @param {string} dados.razaoSocial
 * @param {string} dados.cnpjProprietario
 * @param {string} dados.logradouro
 * @param {string} dados.numero
 * @param {string} dados.complemento
 * @param {string} dados.CEP
 * @param {string} dados.bairro
 * @param {string} dados.municipio
 * @param {string} dados.UF
 * @param {string} dados.email
 * @param {string} dados.telefone
 * @param {string} dados.situacaoCadastral
 * @param {string} dados.CNAE
 * @param {string} dados.proprietario
 * @param {string} dados.autorizacao
 * @param {string} dados.regional
 * @param {string} dados.sigla
 * @param {string} dados.codigoMunicipio
 * @param {string} dados.observacaoProprietario
 * @returns {number} O idProprietario gerado
 * @throws {Error} Se CNPJ já existir ou houver erro de acesso
 */
function inserirProprietario(dados) {
    var lock = LockService.getScriptLock();
    lock.tryLock(10000);

    if (!lock.hasLock()) {
        throw new Error('Sistema ocupado. Tente novamente em instantes.');
    }

    try {
        if (cnpjJaExiste(dados.cnpjProprietario)) {
            throw new Error('CNPJ ja cadastrado.');
        }

        var sheet = getProprietariosSheet();
        var novoId = getNextId(SHEET_NAME_PROPRIETARIOS);

        var linha = [
            novoId,
            dados.razaoSocial || '',
            dados.cnpjProprietario || '',
            dados.logradouro || '',
            dados.numero || '',
            dados.complemento || '',
            dados.CEP || '',
            dados.bairro || '',
            dados.municipio || '',
            dados.UF || '',
            dados.email || '',
            dados.telefone || '',
            dados.situacaoCadastral || '',
            dados.CNAE || '',
            dados.proprietario || '',
            dados.autorizacao || '',
            dados.regional || '',
            dados.sigla || '',
            dados.codigoMunicipio || '',
            dados.observacaoProprietario || '',
        ];

        sheet.appendRow(linha);
        console.log('Proprietario inserido: ID', novoId, '-', dados.razaoSocial);

        return novoId;
    } catch (error) {
        console.error('Erro ao inserir proprietario:', error);
        throw error;
    } finally {
        lock.releaseLock();
    }
}

/**
 * Atualiza os dados de um proprietário existente na aba "Proprietarios".
 * Localiza a linha pelo idProprietario (coluna A). Se o CNPJ for alterado,
 * valida que o novo CNPJ não conflite com outro registro.
 * @param {number} idProprietario ID do proprietário a atualizar
 * @param {Object} dados Objeto com os novos dados (mesmos campos de inserirProprietario, exceto id)
 * @returns {boolean} true se atualizou com sucesso
 * @throws {Error} Se ID não encontrado, CNPJ duplicado ou erro de acesso
 */
function atualizarProprietario(idProprietario, dados) {
    var lock = LockService.getScriptLock();
    lock.tryLock(10000);

    if (!lock.hasLock()) {
        throw new Error('Sistema ocupado. Tente novamente em instantes.');
    }

    try {
        var sheet = getProprietariosSheet();
        var data = sheet.getDataRange().getValues();
        var linhaEncontrada = -1;
        var cnpjAtual = '';

        for (var i = 1; i < data.length; i++) {
            if (Number(data[i][0]) === Number(idProprietario)) {
                linhaEncontrada = i;
                cnpjAtual = String(data[i][2]);
                break;
            }
        }

        if (linhaEncontrada === -1) {
            throw new Error('Proprietario nao encontrado.');
        }

        var novoCnpj = String(dados.cnpjProprietario || '');
        if (novoCnpj !== cnpjAtual && novoCnpj !== '') {
            for (var j = 1; j < data.length; j++) {
                if (j !== linhaEncontrada && String(data[j][2]) === novoCnpj) {
                    throw new Error('CNPJ ja cadastrado para outro proprietario.');
                }
            }
        }

        var linhaPlanilha = linhaEncontrada + 1;

        var valoresAtualizados = [
            idProprietario,
            dados.razaoSocial || '',
            dados.cnpjProprietario || '',
            dados.logradouro || '',
            dados.numero || '',
            dados.complemento || '',
            dados.CEP || '',
            dados.bairro || '',
            dados.municipio || '',
            dados.UF || '',
            dados.email || '',
            dados.telefone || '',
            dados.situacaoCadastral || '',
            dados.CNAE || '',
            dados.proprietario || '',
            dados.autorizacao || '',
            dados.regional || '',
            dados.sigla || '',
            dados.codigoMunicipio || '',
            dados.observacaoProprietario || '',
        ];

        sheet.getRange(linhaPlanilha, 1, 1, valoresAtualizados.length)
            .setValues([valoresAtualizados]);

        console.log('Proprietario atualizado: ID', idProprietario);
        return true;
    } catch (error) {
        console.error('Erro ao atualizar proprietario ID', idProprietario + ':', error);
        throw error;
    } finally {
        lock.releaseLock();
    }
}

/**
 * Remove um proprietário da aba "Proprietarios" pelo ID.
 * @param {number} idProprietario ID do proprietário a excluir
 * @throws {Error} Se ID não encontrado ou erro de acesso
 */
function excluirProprietario(idProprietario) {
    try {
        var sheet = getProprietariosSheet();
        var data = sheet.getDataRange().getValues();

        for (var i = 1; i < data.length; i++) {
            if (Number(data[i][0]) === Number(idProprietario)) {
                sheet.deleteRow(i + 1);
                console.log('Proprietario excluido: ID', idProprietario);
                return;
            }
        }

        throw new Error('Proprietario nao encontrado.');
    } catch (error) {
        console.error('Erro ao excluir proprietario ID', idProprietario + ':', error);
        throw error;
    }
}

/**
 * Busca um proprietário pelo ID na aba "Proprietarios".
 * @param {number} idProprietario ID do proprietário
 * @returns {Object|null} Objeto com todos os campos do proprietário, ou null se não existir
 */
function buscarProprietarioPorId(idProprietario) {
    try {
        var sheet = getProprietariosSheet();
        var data = sheet.getDataRange().getValues();

        for (var i = 1; i < data.length; i++) {
            if (Number(data[i][0]) === Number(idProprietario)) {
                var proprietario = {};
                for (var j = 0; j < COLUNAS_PROPRIETARIOS.length; j++) {
                    proprietario[COLUNAS_PROPRIETARIOS[j]] = data[i][j];
                }
                return proprietario;
            }
        }

        return null;
    } catch (error) {
        console.error('Erro ao buscar proprietario ID', idProprietario + ':', error);
        throw new Error('Erro ao buscar proprietario.');
    }
}

/**
 * Lista todos os proprietários cadastrados na aba "Proprietarios".
 * @returns {Array<Object>} Array de objetos, cada um com todas as colunas como chaves
 */
function listarProprietarios() {
    try {
        var sheet = getProprietariosSheet();
        var data = sheet.getDataRange().getValues();
        var proprietarios = [];

        for (var i = 1; i < data.length; i++) {
            var proprietario = {};
            for (var j = 0; j < COLUNAS_PROPRIETARIOS.length; j++) {
                proprietario[COLUNAS_PROPRIETARIOS[j]] = data[i][j];
            }
            proprietarios.push(proprietario);
        }

        return proprietarios;
    } catch (error) {
        console.error('Erro ao listar proprietarios:', error);
        throw new Error('Erro ao listar proprietarios.');
    }
}

// ============================================================
// EXEMPLO DE USO (descomente para testar)
// ============================================================
//
// function exemploUsoProprietario() {
//     try {
//         // --- Inserir ---
//         var novoId = inserirProprietario({
//             razaoSocial: 'Empresa Exemplo Ltda',
//             cnpjProprietario: '11222333000181',
//             logradouro: 'Rua das Flores',
//             numero: '123',
//             complemento: 'Sala 5',
//             CEP: '01001000',
//             bairro: 'Centro',
//             municipio: 'Sao Paulo',
//             UF: 'SP',
//             email: 'contato@exemplo.com',
//             telefone: '(11) 99999-8888',
//             situacaoCadastral: 'Ativo',
//             CNAE: '6201-5/01',
//             proprietario: 'Joao Silva',
//             autorizacao: 'Sim',
//             regional: 'Sudeste',
//             sigla: 'SP',
//             codigoMunicipio: '3550308',
//             observacaoProprietario: 'Cliente desde 2024',
//         });
//         console.log('Novo ID:', novoId);
//
//         // --- Listar ---
//         var todos = listarProprietarios();
//         console.log('Total de proprietarios:', todos.length);
//
//         // --- Buscar por ID ---
//         var proprietario = buscarProprietarioPorId(novoId);
//         console.log('Proprietario:', proprietario.razaoSocial);
//
//         // --- Atualizar ---
//         atualizarProprietario(novoId, {
//             razaoSocial: 'Empresa Exemplo Atualizada S/A',
//             cnpjProprietario: '11222333000181',
//             logradouro: 'Av. Paulista',
//             numero: '1000',
//             complemento: '15o andar',
//             CEP: '01310100',
//             bairro: 'Bela Vista',
//             municipio: 'Sao Paulo',
//             UF: 'SP',
//             email: 'novo@exemplo.com',
//             telefone: '(11) 98888-7777',
//             situacaoCadastral: 'Ativo',
//             CNAE: '6201-5/01',
//             proprietario: 'Joao Silva',
//             autorizacao: 'Sim',
//             regional: 'Sudeste',
//             sigla: 'SP',
//             codigoMunicipio: '3550308',
//             observacaoProprietario: 'Contrato renovado',
//         });
//
//         // --- Excluir ---
//         excluirProprietario(novoId);
//
//     } catch (error) {
//         console.error('Erro no exemplo:', error.message);
//     }
// }
