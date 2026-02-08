// videos.js — FAST + SAFE + NO BLUR (Android/iOS/Desktop)
// ✅ Lazy preview (IntersectionObserver)
// ✅ Streaming protetto via Worker
// ✅ Modal con frecce + tastiera
// ✅ Watermark preview + modal
// ✅ Badge NEW globale (KV) + cache locale fallback
// ✅ FAVORITES (localStorage) per VIP code
// ✅ HEART via SVG (NO emoji) => identico su desktop/mobile
// ✅ DOUBLE TAP = FAVORITE (grid + modal) + cuore anche nel modal
// ✅ FILTRI/ORDINE: ascolta evento "vip:filters-change" (da videos.html) senza cambiare struttura

(() => {
  "use strict";

  const API_BASE =
    window.VIP_WORKER_URL ||
    "https://divine-silence-8c09vip-access-verify.ilidoncheva.workers.dev";

  const CONTENT_TYPE = "videos";

  const vgrid = document.getElementById("vgrid");
  const modal = document.getElementById("modal");
  const modalContent = document.getElementById("modalContent");
  const modalClose = document.getElementById("modalClose");

  if (!vgrid || !modal || !modalContent) return;

  // blocchi soft
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("dragstart", (e) => e.preventDefault());

  /* ================= WATERMARK ================= */

  const getVipCode = () =>
    (sessionStorage.getItem("vip_code") || "VIP").toUpperCase();

  const formatStamp = (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${getVipCode()}\n${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(
      d.getHours()
    )}:${p(d.getMinutes())} • VIP PRIVATE • SCREENSHOT TRACCIATI`;
  };

  const makeWM = (extra = "") => {
    const el = document.createElement("div");
    el.className = `wm ${extra}`.trim();
    el.textContent = formatStamp(new Date());
    return el;
  };

  const makeCenterWM = (extra = "") => {
    const el = document.createElement("div");
    el.className = `wm wm--center ${extra}`.trim();
    el.textContent = getVipCode();
    return el;
  };

  const wmTimer = setInterval(() => {
    document.querySelectorAll(".wm").forEach((wm) => {
      wm.textContent = wm.classList.contains("wm--center")
        ? getVipCode()
        : formatStamp(new Date());
    });
  }, 60_000);

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

  const setFav = (name, on) => {
    if (!name) return false;
    if (on) favs.add(name);
    else favs.delete(name);
    saveFavs(favs);
    return favs.has(name);
  };

  const toggleFav = (name) => setFav(name, !isFav(name));

  // per sync UI grid <-> modal
  const favBtnByName = new Map(); // name -> button

  const setFavBtnUI = (btn, on) => {
    if (!btn) return;
    btn.classList.toggle("is-on", !!on);
    btn.setAttribute("aria-pressed", String(!!on));
  };

  const syncFavUI = (name) => {
    const on = isFav(name);
    const gridBtn = favBtnByName.get(name);
    setFavBtnUI(gridBtn, on);

    const modalBtn = modalContent.querySelector(".fav-btn[data-name]");
    if (modalBtn && modalBtn.getAttribute("data-name") === name) {
      setFavBtnUI(modalBtn, on);
    }
  };

  // SVG heart
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

  const makeFavBtn = (name) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "fav-btn";
    b.setAttribute("aria-label", "Aggiungi ai preferiti");
    b.setAttribute("aria-pressed", String(isFav(name)));
    b.setAttribute("data-name", name);

    setFavBtnUI(b, isFav(name));
    b.appendChild(heartSvg());

    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation(); // IMPORTANT: non apre il modal
      toggleFav(name);
      syncFavUI(name);

      // se sto guardando "Preferiti", un unfav deve sparire dalla griglia
      if (uiState.filter === "fav") {
        requestRender();
      }
    });

    return b;
  };

  /* ================= DOUBLE TAP (grid + modal) ================= */

  // blocca l'apertura modal quando faccio double tap sul preview
  const suppressCardClick = (card) => {
    if (!card) return;
    card.dataset.noclick = "1";
    setTimeout(() => {
      try {
        delete card.dataset.noclick;
      } catch {}
    }, 420);
  };

  // helper double tap affidabile
  const attachDoubleTap = (el, onDouble, onSuppressClick) => {
    if (!el) return;

    // desktop
    el.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (onSuppressClick) onSuppressClick();
      onDouble();
    });

    // mobile touch
    let lastUp = 0;
    let lastX = 0;
    let lastY = 0;

    el.addEventListener(
      "pointerup",
      (e) => {
        if (e.pointerType !== "touch") return;

        const now = Date.now();
        const dt = now - lastUp;

        const dx = Math.abs(e.clientX - lastX);
        const dy = Math.abs(e.clientY - lastY);

        const isDouble = dt > 0 && dt < 380 && dx < 22 && dy < 22;

        if (isDouble) {
          e.preventDefault();
          e.stopPropagation();
          lastUp = 0;
          if (onSuppressClick) onSuppressClick();
          onDouble();
          return;
        }

        lastUp = now;
        lastX = e.clientX;
        lastY = e.clientY;
      },
      { passive: false }
    );
  };

  /* ================= NEW BADGE (GLOBAL KV + local cache) ================= */

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

  const findCardByName = (name) => {
    return vgrid
      .querySelector(`[data-file="${CSS.escape(name)}"]`)
      ?.closest?.(".card");
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

  const buildMediaUrl = (name) =>
    `${API_BASE}/media/videos/${encodeURIComponent(
      name
    )}?token=${encodeURIComponent(getToken())}`;

  /* ================= LAZY PREVIEW ================= */

  const loaded = new WeakSet();

  const io =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((e) => {
              const v = e.target;
              const file = v?.dataset?.file;
              if (!file) return;

              if (e.isIntersecting && !loaded.has(v)) {
                v.src = buildMediaUrl(file);
                loaded.add(v);
                v.play().catch(() => {});
              }
            });
          },
          { rootMargin: "250px", threshold: 0.25 }
        )
      : null;

  /* ================= FILTRI + ORDINE ================= */

  // stato UI (default: Tutti + Più recenti)
  const uiState = { filter: "all", order: "desc" }; // filter: all|new|fav ; order: desc|asc

  // lista "master" dal server (ordine originale)
  let baseFiles = [];

  // lista "visibile" dopo filtri/ordine
  let files = [];

  let listLoaded = false; // 👈 per non mostrare "Nessun video" prima che arrivi la lista

  const computeVisibleFiles = () => {
    let out = baseFiles.slice(0);

    // filtro
    if (uiState.filter === "new") {
      out = out.filter((f) => !seen.has(f));
    } else if (uiState.filter === "fav") {
      out = out.filter((f) => isFav(f));
    }

    // ordine: assumiamo che baseFiles arrivi già "più recenti"
    if (uiState.order === "asc") out.reverse();

    return out;
  };

  // throttle render (per evitare refresh doppi ravvicinati)
  let renderScheduled = false;
  const requestRender = () => {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      renderGrid();
    });
  };

  /* ================= MODAL + FRECCE ================= */

  let idx = -1;

  let btnPrev, btnNext;

  const updateArrows = () => {
    if (!btnPrev || !btnNext) return;
    btnPrev.style.display = idx > 0 ? "flex" : "none";
    btnNext.style.display = idx < files.length - 1 ? "flex" : "none";
  };

  const openModalAt = (i) => {
    if (!files.length) return;

    idx = Math.max(0, Math.min(i, files.length - 1));
    const name = files[idx];
    if (!name) return;

    // NEW -> visto
    markSeenGlobal(name);

    const card = findCardByName(name);
    if (card) hideBadgeOnCard(card);

    modalContent.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";

    const v = document.createElement("video");
    v.controls = true;
    v.playsInline = true;
    v.autoplay = true;
    v.src = buildMediaUrl(name);

    // ❤️ cuore anche nel modal
    const modalFavBtn = makeFavBtn(name);

    // double tap nel modal = favorite
    attachDoubleTap(v, () => {
      toggleFav(name);
      syncFavUI(name);

      // se sto in "Preferiti", un unfav deve sparire dalla lista (ma NON chiudo il modal)
      if (uiState.filter === "fav" && !isFav(name)) {
        // dopo un tick ricostruisco la lista visibile e riallineo idx
        setTimeout(() => {
          const oldName = name;
          requestRender();

          // se il file non è più visibile, provo a restare sullo stesso indice (o precedente)
          const newIdx = files.indexOf(oldName);
          if (newIdx === -1) {
            // chiudo se non c’è più nulla
            if (!files.length) closeModal();
            else openModalAt(Math.min(idx, files.length - 1));
          }
        }, 0);
      }
    });

    wrap.append(
      v,
      makeWM("wm--modal"),
      makeCenterWM("wm--modal"),
      modalFavBtn
    );

    modalContent.appendChild(wrap);

    modal.classList.add("open");
    updateArrows();

    // sync corretto al render
    syncFavUI(name);

    // se sto su "Nuovi", appena apro questo diventa "visto" → deve sparire dalla griglia
    if (uiState.filter === "new") {
      setTimeout(() => requestRender(), 0);
    }
  };

  const closeModal = () => {
    modal.classList.remove("open");
    modalContent.innerHTML = "";
    idx = -1;
    updateArrows();
  };

  btnPrev = document.createElement("button");
  btnNext = document.createElement("button");

  btnPrev.className = "modal-nav modal-prev";
  btnNext.className = "modal-nav modal-next";
  btnPrev.textContent = "‹";
  btnNext.textContent = "›";

  btnPrev.type = "button";
  btnNext.type = "button";

  btnPrev.onclick = () => openModalAt(idx - 1);
  btnNext.onclick = () => openModalAt(idx + 1);

  modal.append(btnPrev, btnNext);

  modalClose?.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => e.target === modal && closeModal());

  document.addEventListener("keydown", (e) => {
    if (!modal.classList.contains("open")) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "ArrowLeft") openModalAt(idx - 1);
    if (e.key === "ArrowRight") openModalAt(idx + 1);
  });

  /* ================= RENDER GRID ================= */

  const renderGrid = () => {
    // ricostruisco la lista visibile in base a stato + seen + favs
    files = computeVisibleFiles();

    vgrid.innerHTML = "";
    favBtnByName.clear();

    if (!files.length) {
      if (!listLoaded) {
        // lista non ancora caricata: non mostrare "Nessun video"
        return; // se vuoi, qui puoi mostrare "Caricamento…"
      }

      vgrid.innerHTML = "<div class='sub'>Nessun video</div>";
      return;
    }

    // se il modal è aperto, riallineo idx sul file corrente (se esiste)
    if (modal.classList.contains("open")) {
      const currentName =
        modalContent
          .querySelector(".fav-btn[data-name]")
          ?.getAttribute("data-name") || "";
      const newIdx = currentName ? files.indexOf(currentName) : -1;
      idx = newIdx >= 0 ? newIdx : Math.min(idx, files.length - 1);
      updateArrows();
    }

    files.forEach((file, i) => {
      const card = document.createElement("div");
      card.className = "card";

      const wrap = document.createElement("div");
      wrap.className = "video-wrap";

      const v = document.createElement("video");
      v.className = "vip-video";

      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.autoplay = true;
      v.preload = "metadata";
      v.dataset.file = file;

      v.style.objectFit = "cover";

      wrap.append(v, makeWM());
      card.appendChild(wrap);

      // ❤️ FAVORITES (SVG) — non apre il modal
      const favBtn = makeFavBtn(file);
      favBtnByName.set(file, favBtn);
      card.appendChild(favBtn);

      // double tap sul preview = favorite (e NON apre modal)
      attachDoubleTap(
        v,
        () => {
          toggleFav(file);
          syncFavUI(file);

          if (uiState.filter === "fav" && !isFav(file)) {
            requestRender();
          }
        },
        () => suppressCardClick(card)
      );

      // NEW badge (solo se NON visto)
      if (!seen.has(file)) {
        card.appendChild(makeNewBadge());
      }

      card.addEventListener("click", () => {
        if (card.dataset.noclick === "1") return;
        openModalAt(i);
      });

      vgrid.appendChild(card);
      if (io) io.observe(v);
    });
  };

  /* ================= EVENTI FILTRI (da videos.html) ================= */

  window.addEventListener("vip:filters-change", (e) => {
    const d = e?.detail || {};
    if (d.type !== "videos") return;

    // accetto solo valori validi
    const f = d.filter;
    const o = d.order;

    uiState.filter = ["all", "new", "fav"].includes(f) ? f : "all";
    uiState.order = ["desc", "asc"].includes(o) ? o : "desc";

    requestRender();
  });

  // fallback: se l’evento è stato sparato prima che videos.js fosse pronto
  const readInitialState = () => {
    try {
      const vip = getVipCode();
      const kF = `vip_filter_videos:${vip}`;
      const kO = `vip_order_videos:${vip}`;
      const f = localStorage.getItem(kF) || "all";
      const o = localStorage.getItem(kO) || "desc";
      uiState.filter = ["all", "new", "fav"].includes(f) ? f : "all";
      uiState.order = ["desc", "asc"].includes(o) ? o : "desc";
    } catch {
      uiState.filter = "all";
      uiState.order = "desc";
    }
  };

  /* ================= INIT ================= */

  (async () => {
    try {
      // requireVip NON deve bloccare i video: lo avviamo in background
      try {
        if (window.requireVip) {
          window.requireVip().catch(() => {});
        }
      } catch {}

      // stato filtri iniziale
      readInitialState();

      // seen globale
      try {
        seen = await loadSeenFromKV();
      } catch (e) {
        console.warn("Seen KV load failed, fallback local:", e);
        seen = loadSeenLocal();
      }

      // list
      const data = await apiJson("/list?type=videos");
      baseFiles = (data.items || []).filter((f) =>
        /\.(mp4|webm|mov)$/i.test(f)
      );
      listLoaded = true; // 👈 da qui in poi "Nessun video" è affidabile

      // render
      renderGrid();
    } catch (e) {
      console.error(e);
      vgrid.innerHTML = "<div class='sub'>Errore caricamento video</div>";
    }
  })();

  window.addEventListener("beforeunload", () => {
    try {
      clearInterval(wmTimer);
    } catch {}
    try {
      if (io) io.disconnect();
    } catch {}
  });
})();
