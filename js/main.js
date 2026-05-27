/**
 * main.js — Scroll reveal, AI panel toggle e envio do formulário
 * ATRA SEVEN
 */

/* ── SCROLL REVEAL ── */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), i * 80);
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

/* ── AI PANEL TOGGLE ── */
function toggleAI() {
  const wrap  = document.getElementById('ai-panel-wrap');
  const arrow = document.getElementById('ai-arrow');
  if (!wrap || !arrow) return;
  wrap.classList.toggle('open');
  arrow.classList.toggle('open');
}

/* ── FORM SUBMIT ── */
function submitForm() {
  const includeCheckbox = document.getElementById('ai-include');
  const aiResultText    = document.getElementById('ai-result-text');
  const messageArea     = document.getElementById('f-msg');

  if (
    includeCheckbox &&
    includeCheckbox.checked &&
    aiResultText &&
    aiResultText.textContent.trim()
  ) {
    const diagBlock = '\n\n--- PRÉ-DIAGNÓSTICO IA ---\n' + aiResultText.textContent;
    if (messageArea && !messageArea.value.includes('PRÉ-DIAGNÓSTICO IA')) {
      messageArea.value += diagBlock;
    }
  }

  /* Aqui você pode integrar com um back-end real (ex: fetch para uma API)
     Por ora exibe uma confirmação simples. */
  alert('Solicitação enviada com sucesso! Entraremos em contato em breve.');
}
