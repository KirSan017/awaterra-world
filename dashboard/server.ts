import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiRouter } from "./api.js";
import { authMiddleware, loginHandler } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(authMiddleware);

app.post("/api/login", loginHandler);
app.use("/api", apiRouter);
app.use(express.static(path.join(__dirname, "public")));

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  const authEnabled = process.env.DASHBOARD_USER && process.env.DASHBOARD_PASS;
  console.log(`Awaterra World dashboard: http://localhost:${PORT}${authEnabled ? " (auth enabled)" : " (no auth)"}`);
});
