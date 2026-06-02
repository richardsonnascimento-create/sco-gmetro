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
 * Processa as credenciais de login.
 * @param {string} email O email do usuário.
 * @param {string} password A senha do usuário.
 * @returns {Object} Um objeto contendo o status da autenticação e uma mensagem.
 */
function processLogin(email, password) {
  // TODO: Implementar lógica de autenticação segura aqui.
  // Por enquanto, é apenas um placeholder para demonstração.
  if (email === "teste@example.com" && password === "senha123") {
    return { success: true, message: "Login bem-sucedido!" };
  } else {
    return { success: false, message: "Email ou senha incorretos." };
  }
}
