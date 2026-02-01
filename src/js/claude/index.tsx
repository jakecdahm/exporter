import React from "react";
import { createRoot } from "react-dom/client";
import { initBolt, csi } from "../lib/utils/bolt";
import App from "./App";
import "./App.scss";

// Debug: Log extension path
console.log("=== Claude Panel Init ===");
if (window.cep || (window as any).__adobe_cep__) {
  const extRoot = csi.getSystemPath("extension");
  console.log("Extension root:", extRoot);
  console.log("Expected JSX path:", `${extRoot}/jsx/index.js`);
}

initBolt();

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
