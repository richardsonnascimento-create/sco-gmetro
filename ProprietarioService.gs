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
    // Fallback para SHEETS_ID (Config.gs) se ID_PRINCIPAL nao estiver definido
    DB_Principal = typeof SHEETS_ID !== 'undefined' ? SHEETS_ID : null;
}

if (!DB_Principal) {
    throw new Error(
        'Nenhuma planilha configurada. Defina ID_PRINCIPAL ou SHEETS_ID nas Script Properties.',
    );
}

console.log('[ProprietarioService] Usando planilha ID:', DB_Principal);

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
            console.log('[getProprietariosSheet] Aba "' + SHEET_NAME_PROPRIETARIOS + '" nao existe, criando...');
            sheet = spreadsheet.insertSheet(SHEET_NAME_PROPRIETARIOS);
            sheet.getRange(1, 1, 1, COLUNAS_PROPRIETARIOS.length).setValues([COLUNAS_PROPRIETARIOS]);
            sheet.getRange(1, 1, 1, COLUNAS_PROPRIETARIOS.length).setFontWeight('bold');
            console.log('[getProprietariosSheet] Aba criada com cabecalho de ' + COLUNAS_PROPRIETARIOS.length + ' colunas.');
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
 * Valida os dígitos verificadores de um CNPJ (14 dígitos).
 * @param {string} cnpj CNPJ (com ou sem máscara)
 * @returns {boolean} true se o CNPJ for válido
 */
function _validarCNPJ_(cnpj) {
    var digits = String(cnpj).replace(/\D/g, '');
    if (digits.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(digits)) return false;

    var calc = function (nums, weights) {
        var sum = 0;
        for (var i = 0; i < nums.length; i++) {
            sum += parseInt(nums[i], 10) * weights[i];
        }
        var rest = sum % 11;
        return rest < 2 ? 0 : 11 - rest;
    };

    var w1 = [5,4,3,2,9,8,7,6,5,4,3,2];
    var w2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];

    if (calc(digits.substring(0, 12), w1) !== parseInt(digits[12], 10)) return false;
    if (calc(digits.substring(0, 13), w2) !== parseInt(digits[13], 10)) return false;

    return true;
}

/**
 * Valida CEP: exatamente 8 dígitos numéricos.
 * @param {string} cep CEP (com ou sem máscara)
 * @returns {boolean}
 */
function _validarCEP_(cep) {
    var digits = String(cep).replace(/\D/g, '');
    return digits.length === 8;
}

/**
 * Valida telefone: 10 ou 11 dígitos numéricos.
 * @param {string} tel Telefone (com ou sem máscara)
 * @returns {boolean}
 */
function _validarTelefone_(tel) {
    var digits = String(tel).replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 11;
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
 * @throws {Error} Se CNPJ já existir, dados inválidos ou erro de acesso
 */
function inserirProprietario(dados) {
    if (!dados.razaoSocial) throw new Error('Razao Social obrigatoria.');
    if (!dados.cnpjProprietario) throw new Error('CNPJ obrigatorio.');
    if (!_validarCNPJ_(dados.cnpjProprietario)) throw new Error('CNPJ invalido.');
    if (dados.CEP && !_validarCEP_(dados.CEP)) throw new Error('CEP invalido.');
    if (dados.telefone && !_validarTelefone_(dados.telefone)) throw new Error('Telefone invalido.');

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
    if (!_validarCNPJ_(dados.cnpjProprietario)) throw new Error('CNPJ invalido.');
    if (dados.CEP && !_validarCEP_(dados.CEP)) throw new Error('CEP invalido.');
    if (dados.telefone && !_validarTelefone_(dados.telefone)) throw new Error('Telefone invalido.');

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

        console.log('[listarProprietarios] Total de linhas (incluindo cabecalho):', data.length);

        for (var i = 1; i < data.length; i++) {
            var proprietario = {};
            for (var j = 0; j < COLUNAS_PROPRIETARIOS.length; j++) {
                proprietario[COLUNAS_PROPRIETARIOS[j]] = data[i][j];
            }
            proprietarios.push(proprietario);
        }

        console.log('[listarProprietarios] Retornando', proprietarios.length, 'proprietarios');
        return proprietarios;
    } catch (error) {
        console.error('[listarProprietarios] Erro:', error);
        return { error: 'Erro ao listar proprietarios: ' + error.message };
    }
}

/**
 * Gera uma string CSV com os dados dos proprietários.
 * Se search for fornecido, filtra por razaoSocial ou cnpjProprietario (case-insensitive).
 * @param {string} [search] Termo opcional para filtrar
 * @returns {string} Conteúdo CSV
 */
function gerarCSVProprietarios(search) {
    try {
        var proprietarios = listarProprietarios();
        if (proprietarios.error) throw new Error(proprietarios.error);

        if (search) {
            var termo = String(search).toLowerCase().trim();
            if (termo) {
                proprietarios = proprietarios.filter(function (p) {
                    return (String(p.razaoSocial || '').toLowerCase().indexOf(termo) !== -1)
                        || (String(p.cnpjProprietario || '').toLowerCase().indexOf(termo) !== -1);
                });
            }
        }

        // CSV header + rows
        var cabecalho = [
            'ID',
            'RazaoSocial',
            'CNPJ',
            'Logradouro',
            'Numero',
            'Complemento',
            'CEP',
            'Bairro',
            'Municipio',
            'UF',
            'Email',
            'Telefone',
            'SituacaoCadastral',
            'CNAE',
            'Proprietario',
            'Autorizacao',
            'Regional',
            'Sigla',
            'CodigoMunicipio',
            'Observacao',
        ];

        var linhas = [cabecalho.join(',')];

        for (var i = 0; i < proprietarios.length; i++) {
            var p = proprietarios[i];
            var valores = [
                p.idProprietario || '',
                _csvCell_(p.razaoSocial || ''),
                p.cnpjProprietario || '',
                _csvCell_(p.logradouro || ''),
                _csvCell_(p.numero || ''),
                _csvCell_(p.complemento || ''),
                p.CEP || '',
                _csvCell_(p.bairro || ''),
                _csvCell_(p.municipio || ''),
                _csvCell_(p.UF || ''),
                p.email || '',
                p.telefone || '',
                _csvCell_(p.situacaoCadastral || ''),
                _csvCell_(p.CNAE || ''),
                _csvCell_(p.proprietario || ''),
                _csvCell_(p.autorizacao || ''),
                _csvCell_(p.regional || ''),
                _csvCell_(p.sigla || ''),
                _csvCell_(p.codigoMunicipio || ''),
                _csvCell_(p.observacaoProprietario || ''),
            ];
            linhas.push(valores.join(','));
        }

        return linhas.join('\n');
    } catch (error) {
        console.error('[gerarCSV] Erro:', error);
        return 'Erro ao gerar CSV: ' + error.message;
    }
}

/**
 * Escapa célula CSV: envolve em aspas duplas se contiver vírgula, aspas ou quebra de linha.
 * @param {string} valor
 * @returns {string}
 */
function _csvCell_(valor) {
    var s = String(valor);
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

/**
 * Consulta CNPJ na API pública do OpenCNPJ (https://api.opencnpj.org/{cnpj}).
 * Utiliza CacheService (1h TTL) para evitar consultas repetidas do mesmo CNPJ.
 * @param {string} cnpj CNPJ com ou sem máscara (pontos, barras, traços)
 * @returns {Object} Retorna objeto com os campos mapeados do proprietário,
 *   ou {error: string} em caso de falha. Campos retornados em formato raw
 *   (sem máscara) — a formatação é feita pelo frontend.
 */
function consultarCNPJ(cnpj) {
    var digits = String(cnpj).replace(/\D/g, '');

    if (digits.length !== 14) {
        return { error: 'CNPJ invalido.' };
    }

    var cache = CacheService.getScriptCache();
    var cacheKey = 'cnpj_' + digits;
    var cached = cache.get(cacheKey);

    if (cached) {
        console.log('[consultarCNPJ] Cache hit para CNPJ:', digits);
        return JSON.parse(cached);
    }

    var url = 'https://api.opencnpj.org/' + digits;

    try {
        var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        var code = response.getResponseCode();

        if (code === 404) {
            console.warn('[consultarCNPJ] CNPJ nao encontrado:', digits);
            return { error: 'CNPJ nao encontrado.' };
        }

        if (code !== 200) {
            console.warn('[consultarCNPJ] HTTP', code, 'para CNPJ:', digits);
            return { error: 'Servico indisponivel. Tente novamente.' };
        }

        var json = JSON.parse(response.getContentText());

        if (!json || !json.razao_social) {
            return { error: 'CNPJ nao encontrado.' };
        }

        var telefone = '';
        if (json.telefones && json.telefones.length > 0) {
            telefone = (json.telefones[0].ddd || '') + (json.telefones[0].numero || '');
        }

        var result = {
            razaoSocial: json.razao_social || '',
            cnpjProprietario: digits,
            logradouro: json.logradouro || '',
            numero: json.numero || '',
            complemento: json.complemento || '',
            bairro: json.bairro || '',
            municipio: json.municipio || '',
            UF: json.uf || '',
            CEP: String(json.cep || '').replace(/\D/g, ''),
            situacaoCadastral: json.situacao_cadastral || '',
            CNAE: json.cnae_principal ? String(json.cnae_principal) : '',
            telefone: telefone,
            email: json.email ? String(json.email).toLowerCase() : '',
        };

        cache.put(cacheKey, JSON.stringify(result), 3600);
        console.log('[consultarCNPJ] Sucesso para CNPJ:', digits);
        return result;
    } catch (error) {
        console.error('[consultarCNPJ] Erro de rede ao consultar CNPJ', digits + ':', error.message);
        return { error: 'Servico indisponivel. Tente novamente.' };
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
