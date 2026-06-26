/**
 * ai-diagnostic.js | Assistente de IA para pré-diagnóstico de redutores
 * ATRA SEVEN
 *
 * Envia apenas os campos estruturados ao backend — o prompt é montado no servidor.
 */

const FIELD_MAX = { marca: 100, potencia: 50, relacao: 50, horas: 50, adicional: 500 };

async function generateDiagnostic() {
  const tipo      = document.getElementById('ai-tipo')?.value      || '';
  const marca     = document.getElementById('ai-marca')?.value     || '';
  const potencia  = document.getElementById('ai-potencia')?.value  || '';
  const relacao   = document.getElementById('ai-relacao')?.value   || '';
  const horas     = document.getElementById('ai-horas')?.value     || '';
  const sintoma   = document.getElementById('ai-sintoma')?.value   || '';
  const adicional = document.getElementById('ai-adicional')?.value || '';

  if (!tipo || !sintoma) {
    alert('Por favor, selecione pelo menos o tipo de equipamento e o sintoma principal.');
    return;
  }

  for (const [field, max] of Object.entries(FIELD_MAX)) {
    const val = { marca, potencia, relacao, horas, adicional }[field];
    if (val && val.length > max) {
      alert(`O campo "${field}" excede o limite de ${max} caracteres.`);
      return;
    }
  }

  const btn     = document.getElementById('ai-btn');
  const loading = document.getElementById('ai-loading');
  const result  = document.getElementById('ai-result');
  const resText = document.getElementById('ai-result-text');

  btn.disabled          = true;
  loading.style.display = 'flex';
  result.classList.remove('visible');

  try {
    const response = await fetch((window.ATRA_API || "https://atra-seven-api.onrender.com") + "/api/diagnostic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, marca, potencia, relacao, horas, sintoma, adicional }),
    });

    const data = await response.json();

    resText.textContent = response.ok
      ? (data.reply || "Não foi possível gerar o diagnóstico.")
      : (data.error || "Não foi possível gerar o diagnóstico.");

    result.classList.add("visible");
  } catch {
    resText.textContent = 'Erro ao conectar com o serviço de IA. Verifique sua conexão e tente novamente.';
    result.classList.add('visible');
  } finally {
    loading.style.display = 'none';
    btn.disabled          = false;
  }
}
