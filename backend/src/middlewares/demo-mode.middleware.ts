import { NextFunction, Request, Response } from "express";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DEMO_ALLOWED_PATHS = new Set(["/api/auth/login", "/api/auth/logout"]);

function isDemoModeEnabled() {
  return String(process.env.IS_DEMO || "").toLowerCase() === "true";
}

export function demoModeMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!isDemoModeEnabled() || !WRITE_METHODS.has(req.method)) {
    return next();
  }

  if (DEMO_ALLOWED_PATHS.has(req.path)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Demo mode restriction",
  });
}
