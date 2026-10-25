import { createCourierClient } from "@courier/api-client";
import { readBackendEnv } from "@courier/config";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { readIdleTimeout } from "./idle.js";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing its #root element");

const client = createCourierClient(readBackendEnv(import.meta.env, "VITE_"));
const idleTimeoutMs = readIdleTimeout(import.meta.env.VITE_DISPATCHER_IDLE_MINUTES);

createRoot(root).render(
  <StrictMode>
    <App client={client} idleTimeoutMs={idleTimeoutMs} />
  </StrictMode>,
);
