import { readBackendEnv } from "@courier/config";
import { createCourierClient } from "@courier/api-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing its #root element");

const client = createCourierClient(readBackendEnv(import.meta.env));

createRoot(root).render(
  <StrictMode>
    <App client={client} />
  </StrictMode>,
);
