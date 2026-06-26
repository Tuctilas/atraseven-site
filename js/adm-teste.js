/**
 * adm-teste.js | VERSÃO DE TESTE (somente interface).
 * Pula o login e simula o upload usando preview local (URL.createObjectURL).
 * NÃO envia nada para o servidor. NÃO usar em produção.
 */
(function () {
  const SERVICE_NAMES = [
    "Manutenção de Redutores", "Reparo de Acoplamentos", "Serviço In Loco",
    "Oficina Especializada", "Diagnóstico Técnico", "Atendimento Emergencial",
  ];

  const $ = (id) => document.getElementById(id);
  const setMsg = (el, text, cls) => { el.textContent = text; el.className = "msg " + (cls || ""); };

  let presentation = [];
  let services = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  let uploadCtx = null;   // { type:'pres' } | { type:'svc', id }

  const login = $("login"), dash = $("dash"), savebar = $("savebar");
  const saveMsg = $("save-msg");
  const fileInput = $("file-input");

  document.addEventListener("DOMContentLoaded", () => {
    wireDash();
    enterDash();           // <-- TESTE: entra direto, sem login
  });

  /* ════════ DASHBOARD ════════ */
  function wireDash() {
    $("btn-logout").onclick = () => location.reload();
    $("btn-save").onclick = doSave;
    $("add-pres").onclick = () => { uploadCtx = { type: "pres" }; fileInput.click(); };
    fileInput.onchange = async () => {
      const files = [...fileInput.files]; fileInput.value = "";
      for (const f of files) await uploadOne(f);
    };
  }

  function enterDash() {
    login.classList.add("hidden");
    dash.classList.remove("hidden");
    savebar.classList.remove("hidden");
    renderPhotos();
    setMsg(saveMsg, "MODO DE TESTE — fotos não são enviadas ao servidor.", "ok");
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
    // TESTE: preview local, sem servidor.
    const url = URL.createObjectURL(file);
    arr.push({ url, caption: "", position: "50% 50%" });
    renderPhotos();
    setMsg(saveMsg, "Foto adicionada (preview local — modo de teste).", "ok");
  }

  function doSave() {
    setMsg(saveMsg, "MODO DE TESTE — nada foi salvo no servidor. Veja o console (F12) para o conteúdo.", "ok");
    const content = {
      contact: {
        whatsappLabel: $("d-wa-label").value.trim(),
        whatsappNumber: $("d-wa-num").value.trim(),
        email: $("d-email").value.trim(),
        linkedin: $("d-linkedin").value.trim(),
      },
      presentation, services,
    };
    console.log("[ADM TESTE] Conteúdo que seria salvo:", content);
  }
})();
