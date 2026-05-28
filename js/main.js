const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), i * 80);
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

function toggleAI() {
  const wrap  = document.getElementById('ai-panel-wrap');
  const arrow = document.getElementById('ai-arrow');
  if (!wrap || !arrow) return;
  wrap.classList.toggle('open');
  arrow.classList.toggle('open');
}

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

  alert('Solicitação enviada com sucesso! Entraremos em contato em breve.');
}
