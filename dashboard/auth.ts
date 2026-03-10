import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

const sessions = new Set<string>();

const STATIC_EXT = /\.(html|css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/i;

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASS;

  if (!user || !pass) {
    next();
    return;
  }

  // Allow static files, scanner, and login endpoint without auth
  if (req.path === "/" || STATIC_EXT.test(req.path) || req.path.startsWith("/scanner") || req.path === "/api/login") {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token || !sessions.has(token)) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }

  next();
}

export function loginHandler(req: Request, res: Response): void {
  const { username, password } = req.body ?? {};
  const expectedUser = process.env.DASHBOARD_USER;
  const expectedPass = process.env.DASHBOARD_PASS;

  if (!expectedUser || !expectedPass) {
    res.json({ ok: true, token: "open" });
    return;
  }

  if (username !== expectedUser || password !== expectedPass) {
    res.status(401).json({ error: "Wrong credentials" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  sessions.add(token);
  res.json({ ok: true, token });
}
