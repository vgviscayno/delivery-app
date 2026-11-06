import { createCourierClient } from "@courier/api-client";
import { readBackendEnv } from "@courier/config";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { readIdleTimeout } from "./idle.js";
import { createConsoleRouter } from "./router.js";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing its #root element");

const client = createCourierClient(readBackendEnv(import.meta.env, "VITE_"));
const idleTimeoutMs = readIdleTimeout(import.meta.env.VITE_DISPATCHER_IDLE_MINUTES);
const router = createConsoleRouter({ client, idleTimeoutMs });

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
