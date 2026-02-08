// script.js — login VIP
// ✅ 1) login con CODICE VIP (Worker)
// ✅ 2) Telegram: gestito dal widget in index.html

const WORKER_URL = "https://divine-silence-8c09vip-access-verify.ilidoncheva.workers.dev";

const input = document.getElementById("codeInput");
const btn = document.getElementById("btnAccess");
const statusEl = document.getElementById("status");

/* =========================
   UI STATUS
========================= */
function setStatus(msg, ok) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = ok ? "#8cffb5" : "#ff8c8c";
}

/* =========================
   LOGIN CON CODICE VIP
========================= */
async function verifyCode() {
  const code = String(input?.value || "").trim().toUpperCase();

  if (!code) {
    setStatus("Inserisci un codice.", false);
    input?.focus();
    return;
  }

  if (btn) btn.disabled = true;
  setStatus("Verifico…", true);

  try {
    const url = `${WORKER_URL}/?code=${encodeURIComponent(code)}`;

    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    const raw = await res.text();

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.error("Risposta non JSON:", raw);
      setStatus("❌ Errore server.", false);
      return;
    }

    if (res.ok && data?.ok === true && typeof data?.token === "string" && data.token.length > 10) {
      sessionStorage.setItem("vip_token", data.token);
      sessionStorage.setItem("vip_code", code);

      setStatus("✅ Accesso completato. Redirect…", true);

      // ✅ IMPORTANTISSIMO su GitHub Pages in cartella:
      window.location.replace("./archive.html");
      return;
    }

    setStatus("❌ " + (data?.error || "Codice non valido"), false);
  } catch (e) {
    console.error(e);
    setStatus("❌ Errore di connessione.", false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* =========================
   EVENTI
========================= */
btn?.addEventListener("click", verifyCode);

input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") verifyCode();
});
