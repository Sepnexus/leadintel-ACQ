// Launcher: wires the two cards to their respective URLs (read from
// /config.json — written by the container entrypoint from env vars at startup)
// and pings each app's API to show a live status pill.

(async () => {
  let cfg = {
    acqUrl:        "http://localhost:3100",
    acqApiUrl:     "http://localhost:54421",
    leadintelUrl:  "http://localhost:3101",
    leadintelApiUrl:"http://localhost:54422",
  };
  try {
    const resp = await fetch("/config.json", { cache: "no-store" });
    if (resp.ok) cfg = { ...cfg, ...(await resp.json()) };
  } catch { /* fall through to defaults */ }

  document.getElementById("card-acq").href = cfg.acqUrl;
  document.getElementById("card-leadintel").href = cfg.leadintelUrl;

  // Live status pings
  const setPill = (app, ok, label) => {
    const pill = document.querySelector(`.pill[data-app="${app}"]`);
    pill.textContent = label;
    pill.classList.remove("ok", "down", "checking");
    pill.classList.add(ok === null ? "checking" : ok ? "ok" : "down");
  };

  const ping = async (app, apiUrl, displayName) => {
    setPill(app, null, `${displayName}: checking…`);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(`${apiUrl}/health`, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(t);
      setPill(app, r.ok, `${displayName}: ${r.ok ? "up" : "error " + r.status}`);
      if (!r.ok) document.getElementById(`card-${app}`).classList.add("disabled");
    } catch {
      setPill(app, false, `${displayName}: down`);
      document.getElementById(`card-${app}`).classList.add("disabled");
    }
  };

  ping("acq",        cfg.acqApiUrl,        "ACQ");
  ping("leadintel",  cfg.leadintelApiUrl,  "Lead Intel");
  setInterval(() => {
    ping("acq",        cfg.acqApiUrl,        "ACQ");
    ping("leadintel",  cfg.leadintelApiUrl,  "Lead Intel");
  }, 15000);
})();
