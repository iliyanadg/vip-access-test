// favorites.js — HUB Preferiti (Foto + Video) + filtro Nuovi
// ✅ Mostra SOLO preferiti
// ✅ Tabs Foto/Video
// ✅ Filtro: Tutti / Nuovi
// ✅ Secure: Foto via bitmap->canvas, Video via URL protetto
// ✅ Watermark + modal

(() => {
  "use strict";

  const API_BASE =
    window.VIP_WORKER_URL ||
    "https://divine-silence-8c09vip-access-verify.ilidoncheva.workers.dev";

  const grid = document.getElementById("favGrid");
  const modal = document.getElementById("modal");
  const modalContent = document.getElementById("modalContent");
  const modalClose = document.getElementById("modalClose");

  const tabPhotos = document.getElementById("tabPhotos");
  const tabVideos = document.getElementById("tabVideos");
  const filterBtns = Array.from(document.querySelectorAll(".fav-filters .pill"));

  if (!grid || !modal || !modalContent || !tabPhotos || !tabVideos) return;

  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("dragstart", (e) => e.preventDefault());

  /* ================= helpers VIP ================= */

  const getVipCode = () => (sessionStorage.getItem("vip_code") || "VIP").toUpperCase();

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

  const buildVideoUrl = (name) =>
    `${API_BASE}/media/videos/${encodeURIComponent(name)}?token=${encodeURIComponent(getToken())}`;

  /* ================= watermark ================= */

  const pad2 = (n) => String(n).padStart(2, "0");

  const stampPhotos = () => {
    const d = new Date();
    const dd = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    const tt = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    return `${getVipCode()}\n${dd} ${tt} • VIP PRIVATE`;
  };

  const stampVideos = () => {
    const d = new Date();
    const dd = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
    const tt = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    return `${getVipCode()}\n${dd} ${tt} • VIP PRIVATE • SCREENSHOT TRACCIATI`;
  };

  const makeWM = (text, extra = "") => {
    const el = document.createElement("div");
    el.className = `wm ${extra}`.trim();
    el.textContent = text;
    return el;
  };

  const makeCenterWM = (extra = "") => {
    const el = document.createElement("div");
    el.className = `wm wm--center ${extra}`.trim();
    el.textContent = getVipCode();
    return el;
  };

  /* ================= favorites storage ================= */

  const favKey = (type) => `vip_favs_${type}:${getVipCode()}`;

  const loadFavs = (type) => {
    try {
      const raw = localStorage.getItem(favKey(type));
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  };

  /* ================= seen (KV) for filter "Nuovi") ================= */

  const loadSeenFromKV = async (type) => {
    const d = await apiJson(`/seen?type=${encodeURIComponent(type)}`);
    const items = Array.isArray(d.items) ? d.items : [];
    return new Set(items);
  };

  /* ================= draw helpers ================= */

  const drawCover = (ctx, bmp, w, h) => {
    const s = Math.max(w / bmp.width, h / bmp.height);
    const sw = w / s, sh = h / s;
    ctx.drawImage(
      bmp,
      (bmp.width - sw) / 2,
      (bmp.height - sh) / 2,
      sw, sh,
      0, 0,
      w, h
    );
  };

  const drawContain = (ctx, bmp, w, h) => {
    const s = Math.min(w / bmp.width, h / bmp.height);
    const dw = bmp.width * s;
    const dh = bmp.height * s;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(
      bmp,
      0, 0,
      bmp.width, bmp.height,
      (w - dw) / 2,
      (h - dh) / 2,
      dw, dh
    );
  };

  /* ================= state ================= */

  let activeTab = "photos";     // "photos" | "videos"
  let activeFilter = "all";     // "all" | "new"

  let listPhotos = [];
  let listVideos = [];
  let seenPhotos = new Set();
  let seenVideos = new Set();

  /* ================= modal ================= */

  let currentFiles = [];
  let currentIndex = -1;

  const openModalPhoto = async (name) => {
    modalContent.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";

    const c = document.createElement("canvas");
    c.className = "modal-canvas";

    wrap.append(
      c,
      makeWM(stampPhotos(), "wm--modal"),
      makeCenterWM("wm--modal")
    );

    modalContent.appendChild(wrap);
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");

    const bmp = await fetchBitmap(`/media/photos/${encodeURIComponent(name)}`);
    c.width = bmp.width;
    c.height = bmp.height;
    drawContain(c.getContext("2d"), bmp, c.width, c.height);
  };

  const openModalVideo = (name) => {
    modalContent.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";

    const v = document.createElement("video");
    v.controls = true;
    v.playsInline = true;
    v.autoplay = true;
    v.src = buildVideoUrl(name);

    wrap.append(
      v,
      makeWM(stampVideos(), "wm--modal"),
      makeCenterWM("wm--modal")
    );

    modalContent.appendChild(wrap);
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  };

  const closeModal = () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modalContent.innerHTML = "";
    currentIndex = -1;
  };

  modalClose?.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => e.target === modal && closeModal());

  document.addEventListener("keydown", (e) => {
    if (!modal.classList.contains("open")) return;
    if (e.key === "Escape") return closeModal();

    // nav con frecce dentro preferiti
    if (e.key === "ArrowLeft" && currentIndex > 0) {
      currentIndex--;
      const name = currentFiles[currentIndex];
      if (activeTab === "photos") openModalPhoto(name);
      else openModalVideo(name);
    }

    if (e.key === "ArrowRight" && currentIndex < currentFiles.length - 1) {
      currentIndex++;
      const name = currentFiles[currentIndex];
      if (activeTab === "photos") openModalPhoto(name);
      else openModalVideo(name);
    }
  });

  /* ================= render ================= */

  const applyFilter = (items, type) => {
    if (activeFilter === "new") {
      const seen = type === "photos" ? seenPhotos : seenVideos;
      return items.filter((name) => !seen.has(name));
    }
    return items;
  };

  // Lazy videos
  const loadedV = new WeakSet();
  const io =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((e) => {
              const v = e.target;
              const file = v?.dataset?.file;
              if (!file) return;
              if (e.isIntersecting && !loadedV.has(v)) {
                v.src = buildVideoUrl(file);
                loadedV.add(v);
                v.play().catch(() => {});
              }
            });
          },
          { rootMargin: "250px", threshold: 0.25 }
        )
      : null;

  const render = async () => {
    grid.innerHTML = "";

    const favs = loadFavs(activeTab);
    const base = activeTab === "photos" ? listPhotos : listVideos;
    const onlyFavs = base.filter((name) => favs.has(name));
    const items = applyFilter(onlyFavs, activeTab);

    if (!items.length) {
      grid.innerHTML =
        activeTab === "photos"
          ? "<div class='sub'>Nessuna foto tra i preferiti</div>"
          : "<div class='sub'>Nessun video tra i preferiti</div>";
      return;
    }

    currentFiles = items;

    if (activeTab === "photos") {
      // Foto: canvas thumbs
      for (let i = 0; i < items.length; i++) {
        const name = items[i];

        const card = document.createElement("div");
        card.className = "card";

        const c = document.createElement("canvas");
        c.className = "thumb";
        c.dataset.file = name;

        card.append(c, makeWM(stampPhotos()));

        card.addEventListener("click", async () => {
          currentIndex = i;
          await openModalPhoto(name);
        });

        grid.appendChild(card);

        // draw thumb
        try {
          const bmp = await fetchBitmap(`/media/photos/${encodeURIComponent(name)}`);
          const r = c.getBoundingClientRect();
          const w = Math.max(180, Math.floor(r.width || 300));
          const h = Math.max(180, Math.floor(r.height || 300));
          c.width = w; c.height = h;
          drawCover(c.getContext("2d"), bmp, w, h);
        } catch {
          // fallback: lascia vuoto
        }
      }
    } else {
      // Video: preview
      items.forEach((file, i) => {
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

        wrap.append(v, makeWM(stampVideos()));
        card.appendChild(wrap);

        card.addEventListener("click", () => {
          currentIndex = i;
          openModalVideo(file);
        });

        grid.appendChild(card);
        if (io) io.observe(v);
        else v.src = buildVideoUrl(file);
      });
    }
  };

  /* ================= UI events ================= */

  const setTab = (t) => {
    activeTab = t;

    tabPhotos.classList.toggle("is-active", t === "photos");
    tabVideos.classList.toggle("is-active", t === "videos");

    tabPhotos.setAttribute("aria-selected", String(t === "photos"));
    tabVideos.setAttribute("aria-selected", String(t === "videos"));

    render();
  };

  const setFilter = (f) => {
    activeFilter = f;
    filterBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.filter === f));
    render();
  };

  tabPhotos.addEventListener("click", () => setTab("photos"));
  tabVideos.addEventListener("click", () => setTab("videos"));

  filterBtns.forEach((b) => {
    b.addEventListener("click", () => setFilter(b.dataset.filter));
  });

  /* ================= init ================= */

  (async () => {
    try {
      if (window.requireVip) await window.requireVip();

      // Load lists
      const p = await apiJson("/list?type=photos");
      const v = await apiJson("/list?type=videos");

      listPhotos = Array.isArray(p.items) ? p.items : [];
      listVideos = (Array.isArray(v.items) ? v.items : []).filter((f) => /\.(mp4|webm|mov)$/i.test(f));

      // Seen for "Nuovi"
      try { seenPhotos = await loadSeenFromKV("photos"); } catch { seenPhotos = new Set(); }
      try { seenVideos = await loadSeenFromKV("videos"); } catch { seenVideos = new Set(); }

      setTab("photos");
      setFilter("all");
    } catch (e) {
      console.error(e);
      grid.innerHTML = "<div class='sub'>Errore caricamento preferiti</div>";
    }
  })();
})();
