const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), i * 80);
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

/* ── menu mobile (hambúrguer) ── */
(function () {
  const toggle = document.getElementById('nav-toggle');
  const menu   = document.getElementById('nav-links');
  if (!toggle || !menu) return;
  const close = () => {
    menu.classList.remove('open');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  };
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  // fecha ao clicar num link do menu
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
})();

/* ── Cloudflare Turnstile ──
   Carrega o script anti-bot e renderiza o widget SÓ quando há sitekey em
   config.js. Sem sitekey, NADA de challenges.cloudflare.com é carregado —
   zero dependência de terceiros até a proteção estar de fato configurada.
   O formulário segue funcionando (a API também degrada aberta nesse caso).
   config.js carrega antes deste arquivo, então a sitekey já está definida. */
let turnstileWidgetId = null;
(function carregarTurnstile() {
  const sitekey = window.ATRA_TURNSTILE_SITEKEY;
  if (!sitekey || !document.getElementById('ts-widget')) return;
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true; s.defer = true;
  s.onload = function () {
    if (!window.turnstile) return;
    try {
      turnstileWidgetId = window.turnstile.render('#ts-widget', {
        sitekey: sitekey,
        action: 'turnstile-spin-v1',
      });
    } catch (_) { /* indisponível — o form degrada aberto */ }
  };
  document.head.appendChild(s);
})();

async function submitForm() {
  const messageArea = document.getElementById('f-msg');

  const nome     = document.getElementById('f-nome')?.value?.trim()     || '';
  const empresa  = document.getElementById('f-empresa')?.value?.trim()  || '';
  const telefone = document.getElementById('f-telefone')?.value?.trim() || '';
  const email    = document.getElementById('f-email')?.value?.trim()    || '';
  const setor    = document.getElementById('f-setor')?.value            || '';
  const mensagem = messageArea?.value?.trim()                           || '';
  const website  = document.getElementById('f-website')?.value          || ''; // honeypot
  const consent  = document.getElementById('f-consent')?.checked        || false;

  if (!nome || !mensagem) {
    alert('Por favor, preencha pelo menos o nome e a mensagem.');
    return;
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('Por favor, informe um e-mail válido.');
    return;
  }

  if (!consent) {
    alert('Para enviar, é necessário concordar com o tratamento dos seus dados.');
    return;
  }

  // Token do Turnstile (vazio se o widget não estiver ativo). A API só
  // exige quando TURNSTILE_SECRET está definido no Render.
  const tsToken = (window.turnstile && turnstileWidgetId !== null)
    ? window.turnstile.getResponse(turnstileWidgetId) : '';

  const btn = document.querySelector('.contact-form .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  try {
    const response = await fetch((window.ATRA_API || "https://atra-seven-api.onrender.com") + "/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, empresa, telefone, email, setor, mensagem, website, consent, "cf-turnstile-response": tsToken }),
    });

    const data = await response.json();

    if (response.ok) {
      alert('Solicitação enviada com sucesso! Entraremos em contato em breve.');
      document.getElementById('f-nome').value    = '';
      document.getElementById('f-empresa').value = '';
      document.getElementById('f-telefone').value = '';
      document.getElementById('f-email').value   = '';
      document.getElementById('f-setor').value   = '';
      if (messageArea) messageArea.value         = '';
      const consentEl = document.getElementById('f-consent');
      if (consentEl) consentEl.checked = false;
    } else {
      alert(data.error || 'Erro ao enviar. Tente novamente.');
    }
  } catch {
    alert('Erro ao conectar com o servidor. Tente novamente.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar Solicitação'; }
    // O token do Turnstile é de uso único: zera para o próximo envio, seja
    // após sucesso ou erro, senão a segunda tentativa reusa um token gasto.
    if (window.turnstile && turnstileWidgetId !== null) {
      try { window.turnstile.reset(turnstileWidgetId); } catch (_) {}
    }
  }
}

/* O acordeão dos cards de serviço foi removido: as fotos agora ficam
   sempre abertas (ver buildServicePanels em content.js), então não há
   mais nada para abrir nem fechar ao clicar. */

/* ── porta dos fundos: 3 cliques no logo "ATRA SEVEN" abrem a área ADM ── */
(function () {
  const logo = document.querySelector('.nav-logo');
  if (!logo) return;
  let count = 0, timer = null;
  logo.addEventListener('click', () => {
    count++;
    clearTimeout(timer);
    if (count >= 3) { count = 0; window.location.href = 'adm.html'; return; }
    timer = setTimeout(() => { count = 0; }, 1200);
  });
})();

/* ── botão de envio do formulário ──
   Ligado aqui, e não por onclick= no HTML, para que a CSP possa proibir
   script inline sem precisar liberar 'unsafe-inline'. */
(function () {
  const btn = document.getElementById('f-submit');
  if (btn) btn.addEventListener('click', submitForm);
})();
