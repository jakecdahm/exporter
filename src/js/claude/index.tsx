import React from "react";
import { createRoot } from "react-dom/client";
import { initBolt } from "../lib/utils/bolt";
import App from "./App";
import "./App.scss";

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
