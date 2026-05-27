# ATRA SEVEN — Site Institucional

Site institucional da **ATRA SEVEN Assistência Técnica em Redutores e Acoplamentos**.

## Estrutura do Projeto

```
atraseven/
├── index.html          ← Página principal
├── css/
│   └── style.css       ← Todos os estilos
├── js/
│   ├── gear-bg.js      ← Canvas de engrenagens animadas no fundo
│   ├── main.js         ← Scroll reveal, toggle do painel IA, envio do form
│   ├── ai-diagnostic.js← Assistente IA para pré-diagnóstico de redutores
│   └── api-example.js  ← Exemplo de back-end Node.js (NÃO vai pro front)
├── assets/             ← Imagens, ícones, logos (adicionar aqui)
└── README.md
```

## Como rodar localmente

Basta abrir o `index.html` no navegador. Não há dependências de build.

```bash
# Ou use um servidor local simples com Node:
npx serve .

# Ou com Python:
python3 -m http.server 8000
```

## Funcionalidades

- Design dark cinematográfico inspirado no Terminal Industries
- Engrenagem SVG animada no logo (nav + hero)
- Canvas de engrenagens girando no fundo (5% de opacidade)
- Scroll reveal em todas as seções
- Ticker animado com os setores e serviços
- Assistente de IA para pré-diagnóstico de redutores (opcional no formulário)
- Layout responsivo

## Assistente de IA

O arquivo `js/ai-diagnostic.js` chama a API da Anthropic diretamente do navegador.

> ⚠️ **Em produção**, nunca exponha a chave de API no front-end.  
> Use o exemplo de back-end em `js/api-example.js` e altere a chamada em  
> `ai-diagnostic.js` para apontar para `/api/diagnostic` (Opção B comentada no arquivo).

### Configuração em produção (Node.js/Express)

```bash
npm install express @anthropic-ai/sdk dotenv cors
```

Crie um `.env` na raiz do servidor:

```
ANTHROPIC_API_KEY=sk-ant-SUACHAVE
```

Rode:

```bash
node js/api-example.js
```

## Git

```bash
git init
git add .
git commit -m "feat: site ATRA SEVEN - layout dark com IA"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/atraseven.git
git push -u origin main
```

## Tecnologias

- HTML5 / CSS3 / JavaScript (vanilla, sem frameworks)
- Google Fonts: Bebas Neue + Barlow + Barlow Condensed
- Canvas API para o fundo de engrenagens
- Anthropic Claude API para o diagnóstico de IA
