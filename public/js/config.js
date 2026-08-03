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

  // Sitekey do Cloudflare Turnstile (anti-bot do formulário). É PÚBLICO —
  // pode ficar no código versionado. A secret correspondente NÃO fica
  // aqui: vai em TURNSTILE_SECRET no Render. Enquanto vazio, o widget não
  // é renderizado e o formulário funciona sem verificação.
  window.ATRA_TURNSTILE_SITEKEY = '0x4AAAAAAEEoW9CwqX240D1R';

  // Token do Cloudflare Web Analytics (medição de acessos, sem cookies).
  // É PÚBLICO. É SÓ o token (o campo "token" do snippet do Cloudflare), não o
  // <script> inteiro — o js/main.js monta o beacon a partir daqui. Enquanto
  // vazio, nenhum script de medição é carregado.
  window.ATRA_CF_ANALYTICS_TOKEN = '08808c3ae0cc49998f7fa3db30d8845c';
})();
