import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme, getInitialTheme } from "./theme";

applyTheme(getInitialTheme());
createRoot(document.getElementById("root")!).render(<App />);
