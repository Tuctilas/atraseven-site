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
  // É PÚBLICO. Pegue em: Cloudflare → Analytics & Logs → Web Analytics →
  // "Add a site" (atraseven.com.br) → copie o token do snippet. Enquanto
  // vazio, nenhum script de medição é carregado (ver js/main.js).
  window.ATRA_CF_ANALYTICS_TOKEN = '';
})();
