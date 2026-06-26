/**
 * content.js | Carrega o conteúdo editável (contato + fotos) da API.
 * Degrada com elegância: se a API falhar, mantém os padrões do HTML e usa placeholders.
 */
(function () {
  const API = window.ATRA_API || "https://atra-seven-api.onrender.com";
  const WA_TEXT = "Olá! Vim pelo site da ATRA SEVEN e gostaria de solicitar um orçamento.";

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    let content = null;
    try {
      const r = await fetch(API + "/api/content", { cache: "no-store" });
      if (r.ok) content = await r.json();
    } catch (_) { /* offline / API fora do ar — usa os padrões do HTML */ }

    if (content && content.contact) applyContact(content.contact);
    buildCarousel(content && content.presentation ? content.presentation : []);
    buildServicePanels(content && content.services ? content.services : {});
  }

  /* ── contato (WhatsApp, e-mail, LinkedIn) ── */
  function applyContact(c) {
    const num = String(c.whatsappNumber || "").replace(/[^0-9]/g, "");
    const waHref = "https://wa.me/" + num + "?text=" + encodeURIComponent(WA_TEXT);
    const wa = document.getElementById("c-whatsapp");
    const waFloat = document.getElementById("wa-float");
    if (wa && num) { wa.href = waHref; if (c.whatsappLabel) wa.textContent = c.whatsappLabel; }
    if (waFloat && num) waFloat.href = waHref;

    const em = document.getElementById("c-email");
    if (em && c.email) { em.href = "mailto:" + c.email; em.textContent = c.email; }

    const li = document.getElementById("c-linkedin");
    if (li && c.linkedin) {
      const clean = String(c.linkedin).replace(/^https?:\/\//, "");
      li.href = "https://" + clean;
      li.textContent = clean;
    }
  }

  /* ── carrossel de apresentação (setas + bolinhas + auto-rotação) ── */
  let track = null, cur = 0, pages = 1, autoTimer = null;

  function buildCarousel(photos) {
    track = document.getElementById("pres-track");
    if (!track) return;
    track.innerHTML = "";
    const list = (photos && photos.length) ? photos : placeholders(6);
    list.forEach((p) => {
      const slide = document.createElement("div");
      slide.className = "slide";
      if (p.placeholder) {
        slide.classList.add("ph");
        slide.innerHTML = "<span>⚙️</span>";
      } else {
        const img = document.createElement("img");
        img.src = p.url; img.alt = p.caption || "Foto ATRA SEVEN"; img.loading = "lazy";
        slide.appendChild(img);
      }
      track.appendChild(slide);
    });
    cur = 0;
    setupControls();
    recalc();
    startAuto();
    window.addEventListener("resize", recalc);
  }

  function placeholders(n) {
    return Array.from({ length: n }, () => ({ placeholder: true }));
  }

  function metrics() {
    const first = track.children[0];
    const st = getComputedStyle(track);
    const gap = parseFloat(st.columnGap || st.gap || "0") || 0;
    const step = first ? first.getBoundingClientRect().width + gap : 0;
    const view = track.parentElement.getBoundingClientRect().width;
    const ipv = Math.max(1, Math.round(view / (step || 1)));
    return { step, ipv };
  }
  function recalc() {
    if (!track || !track.children.length) return;
    const { ipv } = metrics();
    pages = Math.max(1, track.children.length - ipv + 1);
    if (cur > pages - 1) cur = pages - 1;
    apply();
    buildDots();
  }
  function apply() {
    const { step } = metrics();
    track.style.transform = "translateX(" + (-cur * step) + "px)";
    document.querySelectorAll("#pres-dots .carousel-dot")
      .forEach((d, i) => d.classList.toggle("active", i === cur));
  }
  function go(i) { cur = (i + pages) % pages; apply(); startAuto(); }
  function buildDots() {
    const dots = document.getElementById("pres-dots");
    if (!dots) return;
    dots.innerHTML = "";
    for (let i = 0; i < pages; i++) {
      const d = document.createElement("button");
      d.className = "carousel-dot" + (i === cur ? " active" : "");
      d.setAttribute("aria-label", "Ir para a posição " + (i + 1));
      d.addEventListener("click", () => go(i));
      dots.appendChild(d);
    }
  }
  function setupControls() {
    const prev = document.getElementById("pres-prev");
    const next = document.getElementById("pres-next");
    const car = document.getElementById("pres-carousel");
    if (prev) prev.onclick = () => go(cur - 1);
    if (next) next.onclick = () => go(cur + 1);
    if (car) { car.onmouseenter = stopAuto; car.onmouseleave = startAuto; }
  }
  function startAuto() { stopAuto(); if (pages > 1) autoTimer = setInterval(() => go(cur + 1), 4000); }
  function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }

  /* ── serviços: painel de até 2 fotos por card (acordeão) ── */
  function buildServicePanels(services) {
    document.querySelectorAll(".service-card[data-svc]").forEach((card) => {
      const id = card.getAttribute("data-svc");
      const photos = (services && Array.isArray(services[id])) ? services[id] : [];

      card.querySelector(".svc-toggle")?.remove();
      card.querySelector(".svc-photos")?.remove();

      const toggle = document.createElement("div");
      toggle.className = "svc-toggle";
      toggle.textContent = photos.length ? "Ver fotos" : "Fotos em breve";

      const panel = document.createElement("div");
      panel.className = "svc-photos";

      if (photos.length) {
        const inner = document.createElement("div");
        inner.className = "svc-photos-inner";
        photos.slice(0, 2).forEach((p) => {
          const fig = document.createElement("figure");
          fig.className = "svc-photo";
          const img = document.createElement("img");
          img.src = p.url; img.alt = p.caption || "Serviço ATRA SEVEN"; img.loading = "lazy";
          fig.appendChild(img);
          if (p.caption) {
            const cap = document.createElement("figcaption");
            cap.textContent = p.caption;
            fig.appendChild(cap);
          }
          inner.appendChild(fig);
        });
        panel.appendChild(inner);
      } else {
        const empty = document.createElement("div");
        empty.className = "svc-empty";
        empty.textContent = "Em breve adicionaremos fotos deste serviço.";
        panel.appendChild(empty);
      }

      card.appendChild(toggle);
      card.appendChild(panel);
    });
  }
})();
