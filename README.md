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
│   ├── main.js         ← Scroll reveal, menu mobile, envio do form
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
- Layout responsivo


## Deploy do site (frontend)

O site estático é publicado no **Cloudflare Pages** (projeto
`atraseven-site`) pela integração Git nativa: cada push na `main` publica a
pasta `public/`, conforme o `pages_build_output_dir` do `wrangler.toml`.
Sem token, sem GitHub Actions.

> **Não é Workers.** Não existe Worker nesta conta. Se o `wrangler.toml`
> for convertido para o formato de Worker (`[assets]`), o deploy quebra.

A pasta `public/` é **comitada** — não é artefato de build. O Cloudflare
serve ela direto, sem rodar `npm run build`. Ao alterar qualquer arquivo
de origem, rode o build e comite o resultado:

```bash
npm run build && git add public && git commit -m "Atualiza public/"
```

`build.mjs` usa lista de permissão (não de exclusão) de propósito: um
arquivo novo de back-end nunca vai para o site publicado por esquecimento.
Para publicar algo novo, adicione-o explicitamente ao array `FILES`.

### Domínio

O endereço oficial é **www.atraseven.com.br**. O domínio continua
**registrado e pago na HostGator** — nada é transferido para o Cloudflare,
e o registro.br não precisa ser acessado (ele apenas delega para
`ns636`/`ns637.hostgator.com.br`).

A ligação é feita em dois lugares:

| Onde | O quê |
|---|---|
| Cloudflare Pages → projeto → *Custom domains* | Registrar `www.atraseven.com.br` |
| cPanel HostGator → Zone Editor | `CNAME www → atraseven-site.pages.dev` |

O domínio raiz **continua na HostGator** e redireciona para o www — apex
não aceita CNAME. O redirect vem do `hostgator/.htaccess`, que precisa
estar na raiz do `public_html` (ver seção abaixo).

Ordem importa: registre o domínio no Pages **antes** de mudar o DNS, senão
o Cloudflare responde erro de host desconhecido enquanto propaga.

> **O DNS fica na HostGator de propósito.** Os e-mails da empresa
> (`vendas@atraseven.com.br`) são hospedados lá — `MX`, `SPF` e o
> subdomínio `mail` não devem ser alterados, e o plano da HostGator não
> deve ser cancelado.

### O que fica na HostGator

O `public_html` da HostGator deixa de servir o site e passa a servir só o
redirect da raiz para o www. Para isso, `hostgator/.htaccess` precisa ser
enviado por FTP/Gerenciador de Arquivos para a **raiz do `public_html`**.

Ele tem proteção contra loop (só redireciona quando o host não começa com
`www`), então pode ser enviado antes ou depois da mudança de DNS.

O `_redirects` (URLs do site Weebly antigo, ainda indexadas no Google) é
formato **exclusivo do Cloudflare Pages** — o Apache da HostGator ignora
esse arquivo. Se algum dia o site voltar para lá, as regras precisam ser
reescritas como `RewriteRule` no `.htaccess`, senão as URLs antigas viram
404.

### Verificar depois da virada

```bash
curl -sI https://www.atraseven.com.br/ | grep -iE "^(HTTP|server|cf-ray)"
```

Deve responder `HTTP/2 200` e `Server: cloudflare`. Se vier
`Server: Apache`, o DNS ainda não propagou ou o CNAME não foi salvo.

## Backend (API) e armazenamento

A API (`js/api-example.js`, Express) roda no **Render** e cuida do
formulário de contato e da área administrativa (`adm.html`): login, upload
de fotos e edição do conteúdo.

> **O envio de e-mail NÃO usa SMTP em produção.** A saída SMTP é bloqueada
> na rede do Render: a conexão com `mail.atraseven.com.br:587` fica
> pendurada até o proxy devolver 502, embora o mesmo servidor responda em
> ~1s de fora. Por isso o contato sai pela **API HTTP do Resend**. O
> caminho SMTP continua no código só para desenvolvimento local.

O conteúdo e as imagens ficam no **Cloudflare R2** (`js/store.js`, via API
S3-compatível). Variáveis de ambiente necessárias no Render:

| Variável | Descrição |
|---|---|
| `R2_ACCOUNT_ID` | ID da conta Cloudflare |
| `R2_ACCESS_KEY_ID` | Access Key do token de API do R2 |
| `R2_SECRET_ACCESS_KEY` | Secret do token de API do R2 |
| `R2_BUCKET` | Nome do bucket (ex.: `atraseven-fotos`) |
| `R2_PUBLIC_BASE` | URL pública do bucket (r2.dev ou domínio próprio) |
| `ADMIN_EMAIL` | E-mail que faz login no painel |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt da senha (sem isto, o acesso é bloqueado) |
| `JWT_SECRET` | Segredo para assinar os tokens de sessão |
| `RESEND_API_KEY` | Chave da API do Resend — **é o que envia o formulário em produção** |
| `RESEND_FROM` | Remetente, do subdomínio verificado (padrão: `Site ATRA SEVEN <site@envio.atraseven.com.br>`) |
| `CONTACT_EMAIL` | Caixa que recebe as solicitações (padrão: `vendas@atraseven.com.br`) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Só desenvolvimento local — inútil no Render, que bloqueia SMTP |

### Por que um subdomínio de envio

O Resend exige um domínio verificado por DNS. A verificação é feita em
**`envio.atraseven.com.br`**, e não no domínio raiz, de propósito: assim
os registros do Resend ficam isolados embaixo do subdomínio e o `MX`, o
`SPF` e o `DKIM` do apex — que carregam o e-mail da empresa — não são
tocados. Verificar o domínio raiz exigiria editar o `SPF` existente, que é
justamente o registro que não pode quebrar.

O visitante entra como `reply_to`, então responder a mensagem no cliente
de e-mail vai direto para ele, mesmo o remetente sendo do subdomínio.

Gerar o hash da senha do admin (requer `npm install` antes — o comando
depende do `bcryptjs`, que não vem instalado num clone limpo):

```bash
npm install
```

```bash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" "SUA_SENHA"
```

Conferir se um hash corresponde a uma senha:

```bash
node -e "console.log(require('bcryptjs').compareSync(process.argv[1],process.argv[2]))" "SUA_SENHA" 'O_HASH'
```

> Sem `ADMIN_PASSWORD_HASH` definido no Render, o login falha com
> "E-mail ou senha inválidos" para qualquer senha — o código recusa
> fechado de propósito. A mensagem não distingue os dois casos; para
> saber qual é, veja os logs do Render.

## Segurança — decisões que não devem ser desfeitas

| Onde | Regra | Por quê |
|---|---|---|
| `api-example.js` | `app.set("trust proxy", 1)` | Sem isto, atrás do Render todos os visitantes compartilham um `req.ip` e os rate limits viram um balde global: 5 contatos/hora no site inteiro, e qualquer um tranca o login do ADM |
| `_headers` | `script-src` sem `'unsafe-inline'` | Não há `<script>` inline nem `onclick=` no HTML. Se voltar um handler inline ele para de funcionar — corrija o HTML, não afrouxe a CSP |
| `api-example.js` / `store.js` | Lista de permissão de MIME, sem SVG | `/^image\//` aceitaria `image/svg+xml`, e SVG executa `<script>` no domínio público do bucket |
| `store.js` | `deleteImage` exige prefixo `photos/` | Sem isso a rota de excluir foto apaga qualquer chave do bucket, inclusive o `content.json`, que é o "banco" do site |
| `api-example.js` | `bcrypt` roda mesmo com e-mail errado | Sem o hash descartável, e-mail certo responde em ~1s e errado em ~0,25s, revelando qual é a conta do admin |
| `api-example.js` | `requireTLS: true` no SMTP | Sem isso, se o servidor não oferecer STARTTLS a senha SMTP viaja em texto puro |
| `api-example.js` | `app.disable("x-powered-by")` | Não anunciar o framework/versão para casamento com CVEs |
| `api-example.js` | Handlers 404 e de erro em JSON | Sem eles, o Express responde a página HTML "Cannot GET" e transforma a rejeição de CORS num 500 com stack |

### Privacidade das solicitações de orçamento

O formulário de contato **não guarda nada**. A solicitação existe só para
virar e-mail (via Resend) e não é gravada em banco, no R2, nem em disco.
Nada a apagar depois do envio, porque nada é retido.

Em caso de FALHA no envio, o log registra apenas o motivo do erro — nunca
nome, e-mail ou telefone do visitante. O envio também nunca responde
"sucesso" sem ter saído: se o Resend recusar, a rota devolve 500 e o
visitante vê o erro, com o botão do WhatsApp como alternativa. Procure no
log do Render por `[contato] falha no envio` para diagnosticar o Resend.

### Limitação conhecida: rate limit por instância

Os limites de tentativas (`express-rate-limit`) usam memória local. Se o
Render rodar **mais de uma instância** da API, cada uma tem seu próprio
contador, e a proteção fica multiplicada pelo número de instâncias (um
teste real mostrou o contador saltando entre requisições). Para o login
isso é só defesa em profundidade — a proteção real é o bcrypt sobre uma
senha forte, que torna a força bruta online inviável de qualquer modo.
Para eliminar de vez, as opções são: fixar 1 instância no Render, um store
compartilhado (Redis), ou **Cloudflare Turnstile** no formulário de
contato (recomendado contra flood de e-mail, resolve na borda).

## Tecnologias

- HTML5 / CSS3 / JavaScript (vanilla, sem frameworks)
- Google Fonts: Bebas Neue + Barlow + Barlow Condensed
- Canvas API para o fundo de engrenagens
- Back-end Node.js/Express no Render + Cloudflare R2 para armazenamento
