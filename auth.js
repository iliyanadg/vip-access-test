// auth.js — verifica token VIP tramite Worker
// prepara anche i dati VIP per uso futuro (scadenza, nome, ecc.)

window.VIP_WORKER_URL =
  window.VIP_WORKER_URL ||
  "https://divine-silence-8c09vip-access-verify.ilidoncheva.workers.dev";

// true  = se il Worker è giù, NON slogghiamo (UX migliore)
// false = se il Worker è giù, slogghiamo (più sicurezza)
const ALLOW_IF_WORKER_DOWN = true;

// euristica: riconosce un VIP code “vero” (adatta se i tuoi codici hanno formato diverso)
function looksLikeVipCode(v) {
  if (!v) return false;
  const s = String(v).trim().toUpperCase();
  if (s === "TELEGRAM") return false;
  // esempi validi: VIP-94EC20, VIP94EC20, VIP_94EC20
  return /^VIP[-_ ]?[A-Z0-9]{4,}$/i.test(s);
}

/**
 * Valida il token VIP e ritorna info base
 * Atteso:
 *  - { ok: true, vip: "VIP-XXXX" }  (vecchio)
 *  - oppure meglio: { ok: true, vip_code: "VIP-XXXX" } (nuovo consigliato)
 */
async function validateVipToken() {
  const token = sessionStorage.getItem("vip_token");
  if (!token) return { ok: false };

  try {
    const res = await fetch(
      `${window.VIP_WORKER_URL}/validate?token=${encodeURIComponent(token)}`,
      { method: "GET", cache: "no-store" }
    );

    if (!res.ok) return { ok: false };

    const data = await res.json();
    if (!data || data.ok !== true) return { ok: false };

    // 1) priorità a vip_code (nuovo campo consigliato)
    const vipFromWorker =
      (typeof data.vip_code === "string" && data.vip_code) ||
      (typeof data.vip === "string" && data.vip) ||
      null;

    // 2) se è "Telegram" o roba non valida, non la usiamo
    const vipCode = looksLikeVipCode(vipFromWorker) ? vipFromWorker.trim().toUpperCase() : null;

    return { ok: true, vip: vipCode };
  } catch {
    return ALLOW_IF_WORKER_DOWN ? { ok: true } : { ok: false };
  }
}

function forceLogout() {
  sessionStorage.removeItem("vip_token");
  sessionStorage.removeItem("vip_code");
  sessionStorage.removeItem("vip_info");
  window.location.replace("/");
}

// Funzione globale usata da archive / gallery / video / foto
window.requireVip = async function requireVip() {
  const result = await validateVipToken();

  if (!result.ok) {
    forceLogout();
    return;
  }

  // ✅ Se il Worker ci dà un VIP code vero, lo rendiamo “source of truth”
  if (result.vip) {
    sessionStorage.setItem("vip_code", result.vip);
  }

  // 🔹 Salviamo info VIP per uso futuro (scadenza, messaggi, ecc.)
  try {
    sessionStorage.setItem(
      "vip_info",
      JSON.stringify({
        // watermark deve prendere SEMPRE il vip_code (se c’è)
        vip: sessionStorage.getItem("vip_code") || null,
        checkedAt: Date.now(),
      })
    );
  } catch {}
};
