/**
 * adm.js | Área administrativa da ATRA SEVEN.
 * Login: e-mail + senha -> código por e-mail -> token JWT. Edição de contato e fotos.
 */
(function () {
  const API = window.ATRA_API || "https://atra-seven-api.onrender.com";
  const TOKEN_KEY = "atra_adm_token";
  const SERVICE_NAMES = [
    "Manutenção de Redutores", "Reparo de Acoplamentos", "Serviço In Loco",
    "Oficina Especializada", "Diagnóstico Técnico", "Atendimento Emergencial",
  ];

  const $ = (id) => document.getElementById(id);
  const getToken = () => sessionStorage.getItem(TOKEN_KEY);
  const setToken = (t) => sessionStorage.setItem(TOKEN_KEY, t);
  const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);
  const setMsg = (el, text, cls) => { el.textContent = text; el.className = "msg " + (cls || ""); };

  let pendingEmail = "";
  let presentation = [];
  let services = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  let uploadCtx = null;   // { type:'pres' } | { type:'svc', id }

  const login = $("login"), dash = $("dash"), savebar = $("savebar");
  const stepCred = $("step-cred"), stepCode = $("step-code"), loginTitle = $("login-title");
  const loginMsg = $("login-msg"), codeMsg = $("code-msg"), saveMsg = $("save-msg");
  const fileInput = $("file-input");

  document.addEventListener("DOMContentLoaded", () => {
    wireLogin();
    wireDash();
    if (getToken()) enterDash();
  });

  /* ════════ LOGIN ════════ */
  function wireLogin() {
    $("btn-login").onclick = doLogin;
    $("btn-verify").onclick = doVerify;
    $("btn-back").onclick = () => {
      stepCode.classList.add("hidden");
      stepCred.classList.remove("hidden");
      loginTitle.textContent = "ENTRAR";
      setMsg(codeMsg, "", "");
    };
    $("i-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
    $("i-code").addEventListener("keydown", (e) => { if (e.key === "Enter") doVerify(); });
  }

  async function doLogin() {
    const email = $("i-email").value.trim();
    const password = $("i-pass").value;
    if (!email || !password) return setMsg(loginMsg, "Preencha e-mail e senha.", "err");
    const btn = $("btn-login"); btn.disabled = true; setMsg(loginMsg, "Enviando código...", "");
    try {
      const r = await fetch(API + "/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Falha no login.");
      pendingEmail = email;
      stepCred.classList.add("hidden");
      stepCode.classList.remove("hidden");
      loginTitle.textContent = "CÓDIGO";
      setMsg(loginMsg, "", "");
      setMsg(codeMsg, "Código enviado para o e-mail cadastrado.", "ok");
      $("i-code").focus();
    } catch (e) {
      setMsg(loginMsg, e.message, "err");
    } finally { btn.disabled = false; }
  }

  async function doVerify() {
    const code = $("i-code").value.trim();
    if (!code) return setMsg(codeMsg, "Digite o código recebido.", "err");
    const btn = $("btn-verify"); btn.disabled = true; setMsg(codeMsg, "Verificando...", "");
    try {
      const r = await fetch(API + "/api/admin/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, code }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Código inválido.");
      setToken(d.token);
      await enterDash();
    } catch (e) {
      setMsg(codeMsg, e.message, "err");
    } finally { btn.disabled = false; }
  }

  function onAuthFail() {
    clearToken();
    dash.classList.add("hidden");
    savebar.classList.add("hidden");
    login.classList.remove("hidden");
    stepCode.classList.add("hidden");
    stepCred.classList.remove("hidden");
    loginTitle.textContent = "ENTRAR";
    setMsg(loginMsg, "Sessão expirada. Entre novamente.", "err");
  }

  /* ════════ DASHBOARD ════════ */
  function wireDash() {
    $("btn-logout").onclick = () => { clearToken(); location.reload(); };
    $("btn-save").onclick = doSave;
    $("add-pres").onclick = () => { uploadCtx = { type: "pres" }; fileInput.click(); };
    fileInput.onchange = async () => {
      const files = [...fileInput.files]; fileInput.value = "";
      for (const f of files) await uploadOne(f);
    };
  }

  async function enterDash() {
    login.classList.add("hidden");
    dash.classList.remove("hidden");
    savebar.classList.remove("hidden");
    await loadContent();
  }

  async function loadContent() {
    try {
      const r = await fetch(API + "/api/content", { cache: "no-store" });
      const c = await r.json();
      $("d-wa-label").value = c.contact?.whatsappLabel || "";
      $("d-wa-num").value = c.contact?.whatsappNumber || "";
      $("d-email").value = c.contact?.email || "";
      $("d-linkedin").value = c.contact?.linkedin || "";
      presentation = (c.presentation || []).map((p) => ({ url: p.url, caption: p.caption || "", position: p.position || "50% 50%" }));
      const s = c.services || {};
      for (let i = 1; i <= 6; i++) {
        services[i] = (Array.isArray(s[i]) ? s[i] : []).map((p) => ({ url: p.url, caption: p.caption || "", position: p.position || "50% 50%" }));
      }
      renderPhotos();
    } catch (e) {
      setMsg(saveMsg, "Erro ao carregar o conteúdo atual.", "err");
    }
  }

  function renderPhotos() {
    renderList(presentation, $("pres-list"));
    $("pres-count").textContent = presentation.length + " / 10 fotos";
    $("add-pres").disabled = presentation.length >= 10;
    renderServices();
  }

  function renderServices() {
    const wrap = $("svc-services");
    wrap.innerHTML = "";
    SERVICE_NAMES.forEach((name, idx) => {
      const id = idx + 1;
      const block = document.createElement("div");
      block.className = "svc-block";

      const head = document.createElement("div");
      head.className = "svc-block-head";
      head.innerHTML = name + ' <span class="count">' + services[id].length + " / 2</span>";

      const list = document.createElement("div");
      list.className = "photos";

      const add = document.createElement("button");
      add.className = "btn btn-sm"; add.type = "button"; add.textContent = "+ Adicionar foto";
      add.style.marginTop = "0.8rem";
      add.disabled = services[id].length >= 2;
      add.onclick = () => { uploadCtx = { type: "svc", id }; fileInput.click(); };

      block.append(head, list, add);
      wrap.appendChild(block);
      renderList(services[id], list);
    });
  }

  function renderList(arr, container) {
    container.innerHTML = "";
    arr.forEach((p, i) => {
      const el = document.createElement("div");
      el.className = "photo";

      const wrap = document.createElement("div"); wrap.className = "thumb-wrap";
      const img = document.createElement("img");
      img.className = "thumb"; img.src = p.url; img.alt = "";
      img.style.objectPosition = p.position || "50% 50%";
      wrap.append(img, mkGrid(p, img));

      const pc = document.createElement("div"); pc.className = "pc";
      const cap = document.createElement("input");
      cap.type = "text"; cap.placeholder = "Legenda (opcional)"; cap.value = p.caption || "";
      cap.addEventListener("input", () => { p.caption = cap.value; });

      const prow = document.createElement("div"); prow.className = "prow";
      const left = mkBtn("◀", "Mover para a esquerda");
      const right = mkBtn("▶", "Mover para a direita");
      const del = mkBtn("🗑", "Excluir"); del.classList.add("del");
      left.onclick = () => { if (i > 0) { swap(arr, i, i - 1); renderPhotos(); } };
      right.onclick = () => { if (i < arr.length - 1) { swap(arr, i, i + 1); renderPhotos(); } };
      del.onclick = () => { arr.splice(i, 1); renderPhotos(); };

      prow.append(left, right, del);
      pc.append(cap, prow);
      el.append(wrap, pc);
      container.appendChild(el);
    });
  }

  function mkGrid(p, img) {
    const POS = ["0% 0%", "50% 0%", "100% 0%", "0% 50%", "50% 50%", "100% 50%", "0% 100%", "50% 100%", "100% 100%"];
    const grid = document.createElement("div"); grid.className = "grid";
    POS.forEach((pos) => {
      const cell = document.createElement("button");
      cell.type = "button"; cell.title = "Enquadrar aqui";
      if (pos === (p.position || "50% 50%")) cell.classList.add("active");
      cell.onclick = () => {
        p.position = pos;
        img.style.objectPosition = pos;
        grid.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        cell.classList.add("active");
      };
      grid.appendChild(cell);
    });
    return grid;
  }
  function mkBtn(label, title) {
    const b = document.createElement("button");
    b.className = "icon-btn"; b.textContent = label; b.title = title; b.type = "button";
    return b;
  }
  function swap(a, i, j) { const t = a[i]; a[i] = a[j]; a[j] = t; }

  async function uploadOne(file) {
    const ctx = uploadCtx || { type: "pres" };
    const arr = ctx.type === "pres" ? presentation : services[ctx.id];
    const max = ctx.type === "pres" ? 10 : 2;
    if (arr.length >= max) {
      return setMsg(saveMsg, ctx.type === "pres" ? "Máximo de 10 fotos de apresentação." : "Máximo de 2 fotos neste serviço.", "err");
    }
    setMsg(saveMsg, "Enviando imagem...", "");
    const fd = new FormData(); fd.append("photo", file);
    try {
      const r = await fetch(API + "/api/admin/upload", {
        method: "POST", headers: { Authorization: "Bearer " + getToken() }, body: fd,
      });
      if (r.status === 401) return onAuthFail();
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Falha no upload.");
      arr.push({ url: d.url, caption: "", position: "50% 50%" });
      renderPhotos();
      setMsg(saveMsg, "Imagem adicionada — clique em Salvar para publicar.", "ok");
    } catch (e) {
      setMsg(saveMsg, e.message, "err");
    }
  }

  async function doSave() {
    const content = {
      contact: {
        whatsappLabel: $("d-wa-label").value.trim(),
        whatsappNumber: $("d-wa-num").value.trim(),
        email: $("d-email").value.trim(),
        linkedin: $("d-linkedin").value.trim(),
      },
      presentation, services,
    };
    const btn = $("btn-save"); btn.disabled = true; setMsg(saveMsg, "Salvando...", "");
    try {
      const r = await fetch(API + "/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
        body: JSON.stringify(content),
      });
      if (r.status === 401) return onAuthFail();
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Falha ao salvar.");
      presentation = d.content.presentation || [];
      const s = d.content.services || {};
      for (let i = 1; i <= 6; i++) services[i] = Array.isArray(s[i]) ? s[i] : [];
      renderPhotos();
      setMsg(saveMsg, "Salvo! As mudanças já estão no site.", "ok");
    } catch (e) {
      setMsg(saveMsg, e.message, "err");
    } finally { btn.disabled = false; }
  }
})();
