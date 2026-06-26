/**
 * config.js | Base da API — localhost em desenvolvimento, Render em produção.
 * Carregue ANTES dos demais scripts que chamam a API.
 */
(function () {
  var host = location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  window.ATRA_API = isLocal
    ? 'http://localhost:3000'
    : 'https://atra-seven-api.onrender.com';
})();
