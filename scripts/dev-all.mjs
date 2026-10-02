#!/usr/bin/env node
// Runs the FastAPI backend and the Next.js frontend together for local development.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = path.join(root, "backend", ".venv", "bin", "python");
if (!existsSync(python)) {
  console.error("Backend virtualenv missing. Run `npm run api:setup` first.");
  process.exit(1);
}

const children = [
  spawn(python, ["-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"], { cwd: path.join(root, "backend"), stdio: "inherit" }),
  spawn("npm", ["run", "dev"], { cwd: root, stdio: "inherit" }),
];
const stop = () => children.forEach((c) => c.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((c) => c.on("exit", (code) => { stop(); process.exit(code ?? 0); }));
