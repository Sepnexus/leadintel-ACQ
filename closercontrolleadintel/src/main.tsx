import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { consumeSsoHandoff } from "./ccSsoHandoff";

// Phase A8/C2 — consume #cc_sso= token handoff from the launcher BEFORE
// the supabase client tries to hydrate from localStorage.
consumeSsoHandoff();

createRoot(document.getElementById("root")!).render(<App />);
