import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import "./styles/overrides.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root mount element.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
