import React from "react";
import { createRoot } from "react-dom/client";
import Silo from "../adhd-os.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Silo />
  </React.StrictMode>
);

// PWA: production only — a service worker in dev fights Vite's module serving
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
