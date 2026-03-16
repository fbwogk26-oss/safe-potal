import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (import.meta.env.DEV) {
  window.addEventListener("unhandledrejection", (event) => {
    if (!event.reason || !(event.reason instanceof Error)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      console.warn("[dev] suppressed non-Error rejection:", event.reason);
      return;
    }
  }, true);

  window.addEventListener("error", (event) => {
    if (!event.error || !(event.error instanceof Error)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      console.warn("[dev] suppressed non-Error exception:", event.error ?? event.message);
      return;
    }
  }, true);
}

createRoot(document.getElementById("root")!).render(<App />);
