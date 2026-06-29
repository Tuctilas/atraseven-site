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

function toggleAI() {
  const wrap  = document.getElementById('ai-panel-wrap');
  const arrow = document.getElementById('ai-arrow');
  if (!wrap || !arrow) return;
  wrap.classList.toggle('open');
  arrow.classList.toggle('open');
}

async function submitForm() {
  const includeCheckbox = document.getElementById('ai-include');
  const aiResultText    = document.getElementById('ai-result-text');
  const messageArea     = document.getElementById('f-msg');

  if (
    includeCheckbox?.checked &&
    aiResultText?.textContent.trim() &&
    messageArea &&
    !messageArea.value.includes('PRÉ-DIAGNÓSTICO IA')
  ) {
    messageArea.value += '\n\n--- PRÉ-DIAGNÓSTICO IA ---\n' + aiResultText.textContent;
  }

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

  const btn = document.querySelector('.contact-form .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  try {
    const response = await fetch((window.ATRA_API || "https://atra-seven-api.onrender.com") + "/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, empresa, telefone, email, setor, mensagem, website, consent }),
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
  }
}

/* ── serviços: clicar no card abre/fecha o painel de fotos (acordeão) ── */
(function () {
  const cards = document.querySelectorAll('.service-card[data-svc]');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const wasOpen = card.classList.contains('open');
      cards.forEach(c => c.classList.remove('open'));
      if (!wasOpen) card.classList.add('open');
    });
  });
})();

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
