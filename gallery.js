// gallery.js — LIST + watermark + MODAL (SECURE: fetch -> bitmap -> CANVAS)
// ✅ NIENTE blob URL / NIENTE img.src blob
// ✅ thumb + modal su canvas
// ✅ watermark dinamico
// ✅ no right-click / no drag
// ✅ requireVip NON blocca la gallery
// ✅ MODAL NAV: frecce + swipe + tasti ← →
// ✅ SPEED: lazy thumbs + limit concurrency
// ✅ Badge NEW globale (KV) + cache locale (opzionale)
// ✅ FAVORITES (localStorage) per VIP code
// ✅ HEART via SVG (NO emoji) => identico a videos.js (desktop/mobile)
// ✅ MODAL: cuore + double tap sul contenuto per toggle fav (sync con grid)
// ✅ FILTERS: Tutti | Nuovi | Preferiti + Ordine desc/asc via evento vip:filters-change

(() => {
  "use strict";

  const API_BASE =
    window.VIP_WORKER_URL ||
    "https://divine-silence-8c09vip-access-verify.ilidoncheva.workers.dev";

  // 👇 questa gallery è per FOTO
  const CONTENT_TYPE = "photos"; // "photos" | "videos"

  const grid = document.getElementById("grid");
  const modal = document.getElementById("modal");
  const modalContent = document.getElementById("modalContent");
  const modalClose = document.getElementById("modalClose");

  if (!grid || !modal || !modalContent) {
    console.error("gallery.js: DOM non pronto");
    return;
  }

  // blocchi soft
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("dragstart", (e) => e.preventDefault());

  // ✅ SAFE escape per selector (Safari a volte non ha CSS.escape)
  const esc = (s) => {
    try {
      if (window.CSS && typeof CSS.escape === "function") return CSS.escape(String(s));
    } catch {}
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  };

  /* ================= WATERMARK ================= */

  const getVipCode = () =>
    (sessionStorage.getItem("vip_code") || "VIP").toUpperCase();

  const pad2 = (n) => String(n).padStart(2, "0");

  const cornerText = (date) => {
    const d = `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
    const t = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    return `${getVipCode()}\n${d} ${t} • VIP PRIVATE`;
  };

  const makeWM = (kind, extra = "") => {
    const d = document.createElement("div");
    d.className = `wm ${extra}`.trim();
    d.dataset.kind = kind;
    d.textContent = kind === "center" ? getVipCode() : cornerText(new Date());
    return d;
  };

  const refreshWM = () => {
    const now = new Date();
    document.querySelectorAll(".wm").forEach((wm) => {
      wm.textContent = wm.dataset.kind === "center" ? getVipCode() : cornerText(now);
    });
  };

  const wmTimer = setInterval(refreshWM, 60_000);

  /* ================= FILTERS (state) ================= */

  const uiState = { filter: "all", order: "desc" }; // filter: all|new|fav ; order: desc|asc

  const normalizeFilter = (v) => (["all", "new", "fav"].includes(v) ? v : "all");
  const normalizeOrder = (v) => (["desc", "asc"].includes(v) ? v : "desc");

  const readInitialFilterState = () => {
    try {
      const vip = getVipCode();
      const kF = `vip_filter_photos:${vip}`;
      const kO = `vip_order_photos:${vip}`;
      const f = localStorage.getItem(kF) || "all";
      const o = localStorage.getItem(kO) || "desc";
      uiState.filter = normalizeFilter(f);
      uiState.order = normalizeOrder(o);
    } catch {
      uiState.filter = "all";
      uiState.order = "desc";
    }
  };

  /* ================= FAVORITES (localStorage) ================= */

  const favKey = () => `vip_favs_${CONTENT_TYPE}:${getVipCode()}`;

  const loadFavs = () => {
    try {
      const raw = localStorage.getItem(favKey());
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  };

  const saveFavs = (set) => {
    try {
      localStorage.setItem(favKey(), JSON.stringify([...set]));
    } catch {}
  };

  let favs = loadFavs();

  const isFav = (name) => favs.has(name);

  const toggleFav = (name) => {
    if (!name) return false;
    if (favs.has(name)) favs.delete(name);
    else favs.add(name);
    saveFavs(favs);
    return favs.has(name);
  };

  // ✅ IDENTICO a videos.js (DOM SVG, stessa classe + stesso path)
  const heartSvg = () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("heart-icon");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M12 21s-7.2-4.7-9.6-8.3C.6 10 .9 6.9 3.4 5.2 5.6 3.7 8.3 4.3 10 6c.7.7 1.3 1.6 2 2.6.7-1 1.3-1.9 2-2.6 1.7-1.7 4.4-2.3 6.6-.8 2.5 1.7 2.8 4.8 1 7.5C19.2 16.3 12 21 12 21z"
    );
    svg.appendChild(path);
    return svg;
  };

  const setFavBtnState = (btn, on) => {
    if (!btn) return;
    btn.classList.toggle("is-on", !!on);
    btn.setAttribute("aria-pressed", String(!!on));
  };

  /* ================= NEW BADGE (GLOBAL via KV + local cache) ================= */

  const localSeenKey = () => `vip_seen_${CONTENT_TYPE}:${getVipCode()}`;

  const loadSeenLocal = () => {
    try {
      const raw = localStorage.getItem(localSeenKey());
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  };

  const saveSeenLocal = (set) => {
    try {
      localStorage.setItem(localSeenKey(), JSON.stringify([...set]));
    } catch {}
  };

  let seen = new Set();

  const makeNewBadge = () => {
    const b = document.createElement("div");
    b.className = "badge-new";
    b.textContent = "NEW";
    return b;
  };

  const hideBadgeOnCard = (cardEl) => {
    const b = cardEl?.querySelector?.(".badge-new");
    if (b) b.remove();
  };

  // ✅ QUI c’è la fix: niente CSS.escape “obbligatorio”
  const findCardByName = (name) => {
    return grid
      .querySelector(`canvas[data-file="${esc(name)}"]`)
      ?.closest?.(".card");
  };

  const findFavBtnOnCard = (name) => {
    const card = findCardByName(name);
    return card ? card.querySelector(".fav-btn") : null;
  };

  /* ================= SPEED: LAZY THUMBS + LIMIT CONCURRENCY ================= */

  const MAX_PARALLEL_THUMBS = 4;
  let activeThumbLoads = 0;
  let thumbQueue = [];
  let loadedThumbs = new Set();

  const runThumbQueue = () => {
    while (activeThumbLoads < MAX_PARALLEL_THUMBS && thumbQueue.length) {
      const job = thumbQueue.shift();
      if (!job) break;

      activeThumbLoads++;

      Promise.resolve()
        .then(job)
        .catch(() => {})
        .finally(() => {
          activeThumbLoads--;
          runThumbQueue();
        });
    }
  };

  const enqueueThumb = (job) => {
    thumbQueue.push(job);
    runThumbQueue();
  };

  const setupThumbIntersectionObserver = (onVisible) => {
    if (!("IntersectionObserver" in window)) return null;

    return new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          onVisible(e.target);
        }
      },
      { root: null, threshold: 0.15, rootMargin: "350px 0px 350px 0px" }
    );
  };

  /* ================= API ================= */

  const getToken = () => {
    const t = sessionStorage.getItem("vip_token");
    if (!t) throw new Error("Token mancante");
    return t;
  };

  const apiJson = async (path, init = {}) => {
    const r = await fetch(API_BASE + path, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: "Bearer " + getToken(),
      },
      cache: "no-store",
    });
    if (!r.ok) throw new Error("API " + r.status);
    return r.json();
  };

  const fetchBitmap = async (path) => {
    const r = await fetch(API_BASE + path, {
      headers: { Authorization: "Bearer " + getToken() },
      cache: "no-store",
    });
    if (!r.ok) throw new Error("MEDIA " + r.status);
    return createImageBitmap(await r.blob());
  };

  const loadList = async () => {
    const d = await apiJson(`/list?type=${encodeURIComponent(CONTENT_TYPE)}`);
    return Array.isArray(d.items) ? d.items : [];
  };

  const loadSeenFromKV = async () => {
    const d = await apiJson(`/seen?type=${encodeURIComponent(CONTENT_TYPE)}`);
    const items = Array.isArray(d.items) ? d.items : [];
    return new Set(items);
  };

  const markSeenGlobal = async (name) => {
    if (!name) return;

    if (!seen.has(name)) {
      seen.add(name);
      const local = loadSeenLocal();
      local.add(name);
      saveSeenLocal(local);
    }

    try {
      await apiJson("/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: CONTENT_TYPE, name }),
      });
    } catch (e) {
      console.warn("markSeenGlobal KV fail:", e);
    }
  };

  /* ================= DRAW ================= */

  const drawCover = (ctx, bmp, w, h) => {
    const s = Math.max(w / bmp.width, h / bmp.height);
    const sw = w / s,
      sh = h / s;
    ctx.drawImage(
      bmp,
      (bmp.width - sw) / 2,
      (bmp.height - sh) / 2,
      sw,
      sh,
      0,
      0,
      w,
      h
    );
  };

  const drawContain = (ctx, bmp, w, h) => {
    const s = Math.min(w / bmp.width, h / bmp.height);
    const dw = bmp.width * s;
    const dh = bmp.height * s;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(
      bmp,
      0,
      0,
      bmp.width,
      bmp.height,
      (w - dw) / 2,
      (h - dh) / 2,
      dw,
      dh
    );
  };

  /* ================= FILTER APPLY (core) ================= */

  let allFiles = [];
  let files = [];
  let index = -1;

  let listLoaded = false;

  const computeVisibleFiles = () => {
    favs = loadFavs();

    let arr = Array.isArray(allFiles) ? [...allFiles] : [];

    if (uiState.filter === "new") {
      arr = arr.filter((name) => !seen.has(name));
    } else if (uiState.filter === "fav") {
      arr = arr.filter((name) => favs.has(name));
    }

    if (uiState.order === "asc") arr.reverse();

    return arr;
  };

  /* ================= MODAL + NAV ================= */

  let navPrevBtn = null;
  let navNextBtn = null;

  const clampIndex = (i) => {
    if (!files.length) return -1;
    if (i < 0) return 0;
    if (i >= files.length) return files.length - 1;
    return i;
  };

  const updateNavButtonsState = () => {
    if (!navPrevBtn || !navNextBtn) return;
    const atStart = index <= 0;
    const atEnd = index >= files.length - 1;

    navPrevBtn.disabled = atStart;
    navNextBtn.disabled = atEnd;

    navPrevBtn.setAttribute("aria-disabled", String(atStart));
    navNextBtn.setAttribute("aria-disabled", String(atEnd));
  };

  const ensureModalNavButtons = (onPrev, onNext) => {
    if (navPrevBtn && navNextBtn) return;

    navPrevBtn = document.createElement("button");
    navPrevBtn.type = "button";
    navPrevBtn.className = "modal-nav modal-prev";
    navPrevBtn.setAttribute("aria-label", "Foto precedente");
    navPrevBtn.textContent = "‹";
    navPrevBtn.addEventListener("click", onPrev);

    navNextBtn = document.createElement("button");
    navNextBtn.type = "button";
    navNextBtn.className = "modal-nav modal-next";
    navNextBtn.setAttribute("aria-label", "Foto successiva");
    navNextBtn.textContent = "›";
    navNextBtn.addEventListener("click", onNext);

    modal.appendChild(navPrevBtn);
    modal.appendChild(navNextBtn);
  };

  const attachDoubleTap = (el, onDouble) => {
    if (!el) return;

    el.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onDouble();
    });

    let lastTap = 0;
    let startX = 0;
    let startY = 0;

    el.addEventListener(
      "touchstart",
      (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      },
      { passive: true }
    );

    el.addEventListener(
      "touchend",
      (e) => {
        const now = Date.now();
        const dt = now - lastTap;

        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;

        const dx = Math.abs(t.clientX - startX);
        const dy = Math.abs(t.clientY - startY);

        if (dx > 18 || dy > 18) {
          lastTap = now;
          return;
        }

        if (dt > 0 && dt < 280) {
          e.preventDefault();
          e.stopPropagation();
          onDouble();
          lastTap = 0;
        } else {
          lastTap = now;
        }
      },
      { passive: false }
    );
  };

  const closeModal = () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modalContent.innerHTML = "";
    index = -1;

    if (navPrevBtn) navPrevBtn.style.display = "none";
    if (navNextBtn) navNextBtn.style.display = "none";
  };

  const onFavChanged = (name, on) => {
    const cardBtn = findFavBtnOnCard(name);
    if (cardBtn) setFavBtnState(cardBtn, on);

    if (uiState.filter === "fav" && !on) {
      const current = files[index];
      if (modal.classList.contains("open") && current === name) {
        closeModal();
      }
      renderGrid();
    }
  };

  const makeFavBtn = (name) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "fav-btn";
    b.setAttribute("aria-label", "Aggiungi ai preferiti");
    b.setAttribute("aria-pressed", String(isFav(name)));

    if (isFav(name)) b.classList.add("is-on");
    b.appendChild(heartSvg());

    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const on = toggleFav(name);
      setFavBtnState(b, on);

      const twin = findFavBtnOnCard(name);
      if (twin && twin !== b) setFavBtnState(twin, on);

      onFavChanged(name, on);
    });

    return b;
  };

  const openModalAt = async (i) => {
    files = computeVisibleFiles();
    index = clampIndex(i);
    const name = files[index];
    if (!name) return;

    markSeenGlobal(name);

    const card = findCardByName(name);
    if (card) hideBadgeOnCard(card);

    modalContent.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";

    const c = document.createElement("canvas");
    c.className = "modal-canvas";

    const modalFavBtn = makeFavBtn(name);
    modalFavBtn.classList.add("fav-btn--modal");

    wrap.append(
      c,
      makeWM("corner", "wm--modal"),
      makeWM("center", "wm--center"),
      modalFavBtn
    );
    modalContent.appendChild(wrap);

    setFavBtnState(modalFavBtn, isFav(name));
    const cardBtn = findFavBtnOnCard(name);
    if (cardBtn) setFavBtnState(cardBtn, isFav(name));

    attachDoubleTap(c, () => {
      const on = toggleFav(name);
      setFavBtnState(modalFavBtn, on);

      const b = findFavBtnOnCard(name);
      if (b) setFavBtnState(b, on);

      onFavChanged(name, on);
    });

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");

    ensureModalNavButtons(
      () => openModalAt(index - 1),
      () => openModalAt(index + 1)
    );

    if (navPrevBtn) navPrevBtn.style.display = "";
    if (navNextBtn) navNextBtn.style.display = "";
    updateNavButtonsState();

    const bmp = await fetchBitmap(`/media/${CONTENT_TYPE}/${encodeURIComponent(name)}`);
    c.width = bmp.width;
    c.height = bmp.height;
    drawContain(c.getContext("2d"), bmp, c.width, c.height);
    refreshWM();

    if (uiState.filter === "new") {
      setTimeout(() => renderGrid(), 0);
    }
  };

  modalClose?.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (!modal.classList.contains("open")) return;
    if (e.key === "Escape") return closeModal();
    if (e.key === "ArrowLeft") return openModalAt(index - 1);
    if (e.key === "ArrowRight") return openModalAt(index + 1);
  });

  let touchStartX = 0;
  let touchStartY = 0;
  let touchActive = false;

  modal.addEventListener(
    "touchstart",
    (e) => {
      if (!modal.classList.contains("open")) return;
      if (!e.touches || e.touches.length !== 1) return;
      touchActive = true;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    },
    { passive: true }
  );

  modal.addEventListener(
    "touchend",
    (e) => {
      if (!modal.classList.contains("open") || !touchActive) return;
      touchActive = false;

      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;

      if (Math.abs(dy) > Math.abs(dx)) return;

      const TH = 50;
      if (dx > TH) openModalAt(index - 1);
      if (dx < -TH) openModalAt(index + 1);
    },
    { passive: true }
  );

  /* ================= RENDER GRID (with filters) ================= */

  let thumbIO = null;

  const disconnectThumbIO = () => {
    try {
      if (thumbIO) thumbIO.disconnect();
    } catch {}
    thumbIO = null;
  };

  const renderGrid = () => {
    files = computeVisibleFiles();

    disconnectThumbIO();
    thumbQueue = [];
    loadedThumbs = new Set();
    activeThumbLoads = 0;

    grid.innerHTML = "";

    if (!files.length) {
      if (!listLoaded) return;

      if (uiState.filter === "fav") grid.innerHTML = "<div class='sub'>Nessun preferito</div>";
      else if (uiState.filter === "new") grid.innerHTML = "<div class='sub'>Nessun contenuto nuovo</div>";
      else grid.innerHTML = "<div class='sub'>Nessuna foto</div>";
      return;
    }

    thumbIO = setupThumbIntersectionObserver((canvasEl) => {
      const name = canvasEl?.dataset?.file;
      if (!name) return;
      if (loadedThumbs.has(name)) return;

      loadedThumbs.add(name);

      enqueueThumb(async () => {
        const bmp = await fetchBitmap(`/media/${CONTENT_TYPE}/${encodeURIComponent(name)}`);

        const r = canvasEl.getBoundingClientRect();
        const w = Math.max(180, Math.floor(r.width || 300));
        const h = Math.max(180, Math.floor(r.height || 300));

        canvasEl.width = w;
        canvasEl.height = h;

        drawCover(canvasEl.getContext("2d"), bmp, w, h);
      });
    });

    files.forEach((name, i) => {
      const card = document.createElement("div");
      card.className = "card";

      const c = document.createElement("canvas");
      c.className = "thumb";
      c.dataset.file = name;
      c.onclick = () => openModalAt(i);

      card.append(c, makeWM("corner"));
      card.appendChild(makeFavBtn(name));

      if (!seen.has(name)) card.appendChild(makeNewBadge());

      grid.appendChild(card);

      if (thumbIO) thumbIO.observe(c);
      else {
        enqueueThumb(async () => {
          const bmp = await fetchBitmap(`/media/${CONTENT_TYPE}/${encodeURIComponent(name)}`);

          const r = c.getBoundingClientRect();
          const w = Math.max(180, Math.floor(r.width || 300));
          const h = Math.max(180, Math.floor(r.height || 300));

          c.width = w;
          c.height = h;

          drawCover(c.getContext("2d"), bmp, w, h);
        });
      }
    });

    refreshWM();
  };

  /* ================= INIT ================= */

  const safeRequireVip = () => {
    try {
      if (window.requireVip) window.requireVip().catch(() => {});
    } catch {}
  };

  const init = async () => {
    try {
      safeRequireVip();
      readInitialFilterState();

      try {
        seen = await loadSeenFromKV();
      } catch (e) {
        console.warn("Seen KV load failed, fallback local:", e);
        seen = loadSeenLocal();
      }

      allFiles = await loadList();
      listLoaded = true;

      renderGrid();
    } catch (e) {
      console.error(e);
      grid.innerHTML = "<div class='sub'>Errore caricamento</div>";
    }
  };

  window.addEventListener("vip:filters-change", (ev) => {
    try {
      const d = ev && ev.detail ? ev.detail : null;
      if (!d || d.type !== "photos") return;

      uiState.filter = normalizeFilter(d.filter);
      uiState.order = normalizeOrder(d.order);

      if (modal.classList.contains("open")) {
        const current = files[index];
        if (current) {
          const stillFav = isFav(current);
          const stillNew = !seen.has(current);

          if (
            (uiState.filter === "fav" && !stillFav) ||
            (uiState.filter === "new" && !stillNew)
          ) {
            closeModal();
          }
        }
      }

      renderGrid();
    } catch (e) {
      console.warn("vip:filters-change error:", e);
    }
  });

  window.addEventListener("beforeunload", () => {
    try {
      clearInterval(wmTimer);
    } catch {}
    try {
      disconnectThumbIO();
    } catch {}
  });

  init();
})();
