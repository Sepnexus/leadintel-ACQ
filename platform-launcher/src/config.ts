// Runtime config fetched from /config.json (written by the container entrypoint
// from env vars). Falls back to localhost defaults for local dev.

export type LauncherConfig = {
  acqUrl: string;
  acqApiUrl: string;
  acqAnonKey: string;
  leadintelUrl: string;
  leadintelApiUrl: string;
  leadintelAnonKey: string;
};

const DEFAULTS: LauncherConfig = {
  acqUrl: "http://localhost:3100",
  acqApiUrl: "http://localhost:54421",
  acqAnonKey:
    "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3MDAwMDAwMDAsICJleHAiOiAxOTAwMDAwMDAwfQ.kaRTfjiO7xjshwoi_MBwNZFF-vX2vy-yC_vqagDRvys",
  leadintelUrl: "http://localhost:3101",
  leadintelApiUrl: "http://localhost:54422",
  leadintelAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc5OTE0NTgwLCJleHAiOjIwOTUyNzQ1ODB9.UkqBCF2fE78tsbl4QAhhoqBktG2lSChZTBFEjYHfZjA",
};

export async function loadConfig(): Promise<LauncherConfig> {
  try {
    const r = await fetch("/config.json", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      // Only override keys that are actually present and non-empty.
      const merged = { ...DEFAULTS };
      for (const k of Object.keys(DEFAULTS) as (keyof LauncherConfig)[]) {
        if (j[k]) merged[k] = j[k];
      }
      return merged;
    }
  } catch { /* fall through */ }
  return DEFAULTS;
}
