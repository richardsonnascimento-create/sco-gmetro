/**
 * Módulo de Cadastro de Escopos de Serviço.
 * Gerencia CRUD na aba "escopo" da planilha DB_Principal.
 * Relaciona-se com Instrumentos (leitura) e Proprietarios (chave estrangeira).
 *
 * Schema da aba "escopo":
 *   idEscopo | idProprietario | numeroOrdem | codigoEscopo |
 *   codigoInstrumento | dadosExtras (JSON) | dataCriacao
 *
 * Schema da aba "Instrumentos" (leitura):
 *   idInstrumentos | instrumentos | codPreco
 */

/** Planilha principal (mesma dos proprietários). */
var DB_ESCOPO = PropertiesService.getScriptProperties().getProperty('ID_PRINCIPAL');

if (!DB_ESCOPO) {
    DB_ESCOPO = typeof SHEETS_ID !== 'undefined' ? SHEETS_ID : null;
}

if (!DB_ESCOPO) {
    throw new Error(
        'Nenhuma planilha configurada para EscopoService. Defina ID_PRINCIPAL ou SHEETS_ID.',
    );
}

/** Nome da aba onde os escopos são armazenados. */
var SHEET_NAME_ESCOPO = 'escopo';

/** Nome da aba onde os instrumentos são armazenados. */
var SHEET_NAME_INSTRUMENTOS = 'Instrumentos';

/**
 * Nomes das colunas na ordem exata do cabeçalho (índice 0 = idEscopo).
 * @type {string[]}
 */
var COLUNAS_ESCOPO = [
    'idEscopo',
    'idProprietario',
    'numeroOrdem',
    'codigoEscopo',
    'codigoInstrumento',
    'dadosExtras',
    'dataCriacao',
];

/**
 * Obtém (e cria/migra, se necessário) a aba "escopo" na planilha DB_ESCOPO.
 * Se a aba não existir, cria com os cabeçalhos padrão.
 * Se existir mas com colunas insuficientes, migra.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} Objeto Sheet da aba 'escopo'
 * @throws {Error} Se não conseguir acessar a planilha
 */
function getEscopoSheet() {
    try {
        var spreadsheet = SpreadsheetApp.openById(DB_ESCOPO);
        var sheet = spreadsheet.getSheetByName(SHEET_NAME_ESCOPO);

        if (!sheet) {
            console.log('[getEscopoSheet] Aba "' + SHEET_NAME_ESCOPO + '" nao existe, criando...');
            sheet = spreadsheet.insertSheet(SHEET_NAME_ESCOPO);
            sheet.getRange(1, 1, 1, COLUNAS_ESCOPO.length).setValues([COLUNAS_ESCOPO]);
            sheet.getRange(1, 1, 1, COLUNAS_ESCOPO.length).setFontWeight('bold');
            console.log('[getEscopoSheet] Aba criada com ' + COLUNAS_ESCOPO.length + ' colunas.');
            return sheet;
        }

        if (sheet.getLastColumn() < COLUNAS_ESCOPO.length) {
            migrarAbaEscopo(sheet);
        }

        return sheet;
    } catch (error) {
        console.error('[getEscopoSheet] Erro:', error);
        throw new Error('Erro ao acessar a aba de escopos.');
    }
}

/**
 * Migra a aba escopo para 7 colunas se estiver desatualizada.
 * Adiciona colunas faltantes e formata o cabeçalho.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Aba escopo existente
 */
function migrarAbaEscopo(sheet) {
    console.log('[migrarAbaEscopo] Migrando de ' + sheet.getLastColumn() + ' para ' + COLUNAS_ESCOPO.length + ' colunas...');
    var headerRow = sheet.getRange(1, 1, 1, COLUNAS_ESCOPO.length);
    headerRow.setValues([COLUNAS_ESCOPO]);
    headerRow.setFontWeight('bold');

    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
        for (var col = 6; col <= COLUNAS_ESCOPO.length; col++) {
            sheet.getRange(2, col, lastRow - 1, 1).setValue('');
        }
    }
    console.log('[migrarAbaEscopo] Migracao concluida.');
}

/**
 * Retorna o próximo ID sequencial para a aba escopo.
 * Percorre a coluna A ignorando o cabeçalho e retorna max + 1.
 * @returns {number} Próximo ID disponível
 */
function getProximoIdEscopo() {
    try {
        var spreadsheet = SpreadsheetApp.openById(DB_ESCOPO);
        var sheet = spreadsheet.getSheetByName(SHEET_NAME_ESCOPO);
        if (!sheet) return 1;

        var data = sheet.getDataRange().getValues();
        if (data.length <= 1) return 1;

        var maxId = 0;
        for (var i = 1; i < data.length; i++) {
            var id = Number(data[i][0]);
            if (!isNaN(id) && id > maxId) {
                maxId = id;
            }
        }
        return maxId + 1;
    } catch (error) {
        console.error('[getProximoIdEscopo] Erro:', error);
        throw new Error('Erro ao gerar ID para escopo.');
    }
}

/**
 * Retorna o próximo número de ordem sequencial para um proprietário.
 * Baseia-se no maior numeroOrdem existente para aquele idProprietario.
 * @param {number} idProprietario ID do proprietário
 * @returns {number} Próximo número de ordem
 */
function getProximoNumeroOrdem(idProprietario) {
    try {
        var sheet = getEscopoSheet();
        var data = sheet.getDataRange().getValues();
        var maxOrdem = 0;

        for (var i = 1; i < data.length; i++) {
            if (Number(data[i][1]) === Number(idProprietario)) {
                var ordem = Number(data[i][2]);
                if (!isNaN(ordem) && ordem > maxOrdem) {
                    maxOrdem = ordem;
                }
            }
        }
        return maxOrdem + 1;
    } catch (error) {
        console.error('[getProximoNumeroOrdem] Erro:', error);
        throw new Error('Erro ao gerar numero de ordem.');
    }
}

/**
 * Retorna todos os instrumentos da aba "Instrumentos".
 * @returns {Array<{id: number, nome: string, codPreco: number}>}
 * @throws {Error} Se não conseguir acessar a planilha
 */
function listarInstrumentos() {
    try {
        var spreadsheet = SpreadsheetApp.openById(DB_ESCOPO);
        var sheet = spreadsheet.getSheetByName(SHEET_NAME_INSTRUMENTOS);

        if (!sheet) {
            console.log('[listarInstrumentos] Aba "' + SHEET_NAME_INSTRUMENTOS + '" nao encontrada.');
            return [];
        }

        var data = sheet.getDataRange().getValues();
        var instrumentos = [];

        for (var i = 1; i < data.length; i++) {
            instrumentos.push({
                id: Number(data[i][0]),
                nome: String(data[i][1] || ''),
                codPreco: Number(data[i][2]) || 0,
            });
        }

        return instrumentos;
    } catch (error) {
        console.error('[listarInstrumentos] Erro:', error);
        throw new Error('Erro ao listar instrumentos.');
    }
}

/**
 * Retorna todos os escopos de um determinado proprietário.
 * Faz merge com o nome do instrumento a partir da aba Instrumentos.
 * @param {number} idProprietario ID do proprietário
 * @returns {Array<Object>} Lista de escopos com dados extendidos
 * @throws {Error} Se não conseguir acessar a planilha
 */
function listarEscoposPorProprietario(idProprietario) {
    try {
        var sheet = getEscopoSheet();
        var data = sheet.getDataRange().getValues();

        var instrumentos = listarInstrumentos();
        var mapInstrumentos = {};
        for (var i = 0; i < instrumentos.length; i++) {
            mapInstrumentos[instrumentos[i].id] = instrumentos[i].nome;
        }

        var escopos = [];
        for (var j = 1; j < data.length; j++) {
            if (Number(data[j][1]) === Number(idProprietario)) {
                var codInstrumento = Number(data[j][4]) || 0;
                var dadosExtrasRaw = data[j][5] || '{}';
                var dadosExtras = {};

                try {
                    dadosExtras = JSON.parse(dadosExtrasRaw);
                } catch (e) {
                    dadosExtras = {};
                }

                escopos.push({
                    idEscopo: Number(data[j][0]),
                    idProprietario: Number(data[j][1]),
                    numeroOrdem: Number(data[j][2]),
                    codigoEscopo: String(data[j][3] || ''),
                    codigoInstrumento: codInstrumento,
                    nomeInstrumento: mapInstrumentos[codInstrumento] || 'Desconhecido',
                    dadosExtras: dadosExtras,
                    dataCriacao: String(data[j][6] || ''),
                });
            }
        }

        return escopos;
    } catch (error) {
        console.error('[listarEscoposPorProprietario] Erro:', error);
        throw new Error('Erro ao listar escopos.');
    }
}

/**
 * Insere um novo escopo para o proprietário.
 * Gera idEscopo auto-incremento e numeroOrdem sequencial por proprietário.
 * Usa LockService para concorrência.
 * @param {number} idProprietario ID do proprietário
 * @param {string} codigoEscopo Código do escopo (ex: "BAL-001")
 * @param {number} codigoInstrumento ID do instrumento (ref. Instrumentos)
 * @param {string} dadosExtras JSON string com dados extras (ex: cargaMaxima)
 * @returns {number} ID do escopo criado
 * @throws {Error} Se houver falha na inserção
 */
function inserirEscopo(idProprietario, codigoEscopo, codigoInstrumento, dadosExtras) {
    var lock = LockService.getScriptLock();
    try {
        lock.waitLock(10000);

        var idEscopo = getProximoIdEscopo();
        var numeroOrdem = getProximoNumeroOrdem(idProprietario);
        var dataCriacao = new Date().toISOString();

        var sheet = getEscopoSheet();
        sheet.appendRow([
            idEscopo,
            Number(idProprietario),
            numeroOrdem,
            String(codigoEscopo || ''),
            Number(codigoInstrumento) || 0,
            String(dadosExtras || '{}'),
            dataCriacao,
        ]);

        console.log('[inserirEscopo] Escopo ID ' + idEscopo + ' criado para proprietario ' + idProprietario);
        return idEscopo;
    } catch (error) {
        console.error('[inserirEscopo] Erro:', error);
        throw new Error('Erro ao inserir escopo.');
    } finally {
        lock.releaseLock();
    }
}

/**
 * Atualiza os campos de um escopo existente.
 * Usa LockService para concorrência.
 * @param {number} idEscopo ID do escopo a atualizar
 * @param {string} codigoEscopo Novo código do escopo
 * @param {number} codigoInstrumento Novo ID do instrumento
 * @param {string} dadosExtras Novo JSON string de dados extras
 * @throws {Error} Se escopo não encontrado ou houver falha
 */
function atualizarEscopo(idEscopo, codigoEscopo, codigoInstrumento, dadosExtras) {
    var lock = LockService.getScriptLock();
    try {
        lock.waitLock(10000);

        var sheet = getEscopoSheet();
        var data = sheet.getDataRange().getValues();

        for (var i = 1; i < data.length; i++) {
            if (Number(data[i][0]) === Number(idEscopo)) {
                var row = i + 1;
                sheet.getRange(row, 4).setValue(String(codigoEscopo || ''));
                sheet.getRange(row, 5).setValue(Number(codigoInstrumento) || 0);
                sheet.getRange(row, 6).setValue(String(dadosExtras || '{}'));
                console.log('[atualizarEscopo] Escopo ID ' + idEscopo + ' atualizado.');
                return;
            }
        }

        throw new Error('Escopo nao encontrado.');
    } catch (error) {
        console.error('[atualizarEscopo] Erro:', error);
        throw error;
    } finally {
        lock.releaseLock();
    }
}

/**
 * Exclui um escopo pelo ID.
 * Usa LockService para concorrência.
 * @param {number} idEscopo ID do escopo a excluir
 * @throws {Error} Se escopo não encontrado ou houver falha
 */
function excluirEscopo(idEscopo) {
    var lock = LockService.getScriptLock();
    try {
        lock.waitLock(10000);

        var sheet = getEscopoSheet();
        var data = sheet.getDataRange().getValues();

        for (var i = 1; i < data.length; i++) {
            if (Number(data[i][0]) === Number(idEscopo)) {
                sheet.deleteRow(i + 1);
                console.log('[excluirEscopo] Escopo ID ' + idEscopo + ' excluido.');
                return;
            }
        }

        throw new Error('Escopo nao encontrado.');
    } catch (error) {
        console.error('[excluirEscopo] Erro:', error);
        throw error;
    } finally {
        lock.releaseLock();
    }
}

/**
 * Valida dadosExtras conforme o instrumento selecionado.
 * Para BALANCA, exige classeExatidao não vazio (cargaValor é opcional no JSON,
 * mas a classe gerada já contém o valor).
 * Para outros instrumentos, dadosExtras pode ser vazio.
 * @param {number} codigoInstrumento ID do instrumento
 * @param {Object} dadosExtras Objeto com campos extras (já parseado)
 * @returns {{valid: boolean, message: string}} Resultado da validação
 */
function validarDadosExtrasPorInstrumento(codigoInstrumento, dadosExtras) {
    try {
        var instrumentos = listarInstrumentos();
        var nomeInstrumento = '';

        for (var i = 0; i < instrumentos.length; i++) {
            if (instrumentos[i].id === Number(codigoInstrumento)) {
                nomeInstrumento = instrumentos[i].nome;
                break;
            }
        }

        if (nomeInstrumento.toUpperCase() === 'BALANCA') {
            if (!dadosExtras || typeof dadosExtras !== 'object') {
                return { valid: false, message: 'Dados extras obrigatorios para BALANCA.' };
            }
            if (!dadosExtras.classeExatidao || !String(dadosExtras.classeExatidao).trim()) {
                return { valid: false, message: 'Classe de Exatidao e obrigatoria para BALANCA.' };
            }
        }

        return { valid: true, message: '' };
    } catch (error) {
        console.error('[validarDadosExtrasPorInstrumento] Erro:', error);
        return { valid: false, message: 'Erro ao validar dados extras.' };
    }
}
