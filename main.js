// function to call the firt page, generaly index html
function doGet(request) {
  return HtmlService.createTemplateFromFile('login_responsivo').evaluate();
}

// Function to include CSS and JavaScript files
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}