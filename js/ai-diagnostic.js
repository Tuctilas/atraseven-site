/**
 * ai-diagnostic.js — Assistente de IA para pré-diagnóstico de redutores
 * ATRA SEVEN
 *
 * Toda comunicação com a Anthropic é feita via backend local:
 * POST http://localhost:3000/api/diagnostic  (ver js/api-example.js)
 */

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

  const btn     = document.getElementById('ai-btn');
  const loading = document.getElementById('ai-loading');
  const result  = document.getElementById('ai-result');
  const resText = document.getElementById('ai-result-text');

  btn.disabled          = true;
  loading.style.display = 'flex';
  result.classList.remove('visible');

  const prompt = `Você é um especialista técnico em redutores industriais e acoplamentos da empresa ATRA SEVEN.

Com base nos dados abaixo, gere um pré-diagnóstico técnico objetivo e profissional em português, com no máximo 200 palavras. Inclua: possíveis causas do problema, impacto operacional e recomendação de serviço. Seja direto e técnico.

Equipamento: ${tipo}
Marca/Fabricante: ${marca     || 'Não informado'}
Potência: ${potencia          || 'Não informada'}
Relação de redução: ${relacao || 'Não informada'}
Horas de operação: ${horas    || 'Não informadas'}
Sintoma principal: ${sintoma}
Informações adicionais: ${adicional || 'Nenhuma'}

Formate a resposta em 3 blocos curtos:
• POSSÍVEIS CAUSAS:
• IMPACTO OPERACIONAL:
• RECOMENDAÇÃO ATRA SEVEN:`;

  try {
    const response = await fetch("http://localhost:3000/api/diagnostic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });

    const data = await response.json();

    resText.textContent = data.reply || "Não foi possível gerar o diagnóstico.";
    result.classList.add("visible");
  } catch (err) {
    console.error('Erro na IA:', err);
    resText.textContent = 'Erro ao conectar com o serviço de IA. Verifique sua conexão e tente novamente.';
    result.classList.add('visible');
  } finally {
    loading.style.display = 'none';
    btn.disabled          = false;
  }
}
