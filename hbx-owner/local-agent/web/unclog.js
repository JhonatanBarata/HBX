"use strict";

(() => {
  const button = document.querySelector("#btn-local-unclog");
  const feedback = document.querySelector("#ponte-feedback");
  if (!button) return;

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) {
      throw new Error(data?.error || data?.reason || `http_${response.status}`);
    }
    return data || {};
  }

  function setFeedback(text, tone = "normal") {
    if (!feedback) return;
    feedback.textContent = text;
    feedback.style.color = tone === "error" ? "var(--danger, #ef4444)" : tone === "ok" ? "var(--success, #22c55e)" : "";
  }

  button.addEventListener("click", async () => {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Desentupindo…";
    setFeedback("Analisando o bloqueador e reconstruindo a fila…");

    try {
      const report = await postJson("http://127.0.0.1:3098/local-lab/maintenance/unclog", {
        source: "owner_panel",
        force: true,
        resetCircuit: true,
      });

      // O supervisor mantém um disjuntor próprio. Reset best-effort: o Local Lab já foi limpo acima.
      await postJson("http://127.0.0.1:3110/reset", {}).catch(() => null);

      const blocker = report.blockerBefore?.id ? ` · bloqueador ${report.blockerBefore.id.slice(0, 8)}` : "";
      const canceled = Array.isArray(report.canceled) ? report.canceled.length : 0;
      const superseded = Array.isArray(report.superseded) ? report.superseded.length : 0;
      const quarantined = Array.isArray(report.quarantined) ? report.quarantined.length : 0;
      const pending = Array.isArray(report.pendingRebuilt) ? report.pendingRebuilt.length : 0;
      setFeedback(
        `Fila desentupida${blocker}: ${canceled} cancelado(s), ${superseded} duplicado(s), ${quarantined} em quarentena, ${pending} pendente(s).`,
        "ok",
      );
    } catch (error) {
      setFeedback(`Falha ao desentupir: ${error?.message || error}`, "error");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
})();
