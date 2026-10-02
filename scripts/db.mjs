#!/usr/bin/env node
// Local, project-scoped PostgreSQL for development (no Docker, no touching other Postgres servers).
// Usage: node scripts/db.mjs start|stop|status
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".pgdata");
const port = process.env.LOCAL_PG_PORT || "5433";
const dbName = "realestate";

const candidates = ["/opt/homebrew/opt/postgresql@16/bin", "/opt/homebrew/opt/postgresql@15/bin", "/opt/homebrew/opt/postgresql@14/bin", "/usr/local/opt/postgresql@16/bin", "/usr/local/opt/postgresql@15/bin", "/usr/local/opt/postgresql@14/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin", "/usr/lib/postgresql/14/bin"];
const binDir = candidates.find((d) => existsSync(path.join(d, "initdb"))) || "";
const bin = (name) => (binDir ? path.join(binDir, name) : name);

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  return res.status ?? 1;
}

function isReady() {
  return spawnSync(bin("pg_isready"), ["-h", "127.0.0.1", "-p", port], { stdio: "ignore" }).status === 0;
}

const action = process.argv[2] || "start";

if (action === "start") {
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    mkdirSync(dataDir, { recursive: true });
    console.log("Initialising local Postgres cluster in .pgdata ...");
    if (run(bin("initdb"), ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8"]) !== 0) process.exit(1);
  }
  if (!isReady()) {
    const logFile = path.join(dataDir, "server.log");
    const status = run(bin("pg_ctl"), ["-D", dataDir, "-l", logFile, "-o", `-p ${port} -k /tmp -c listen_addresses=127.0.0.1`, "-w", "start"]);
    if (status !== 0) process.exit(status);
  }
  const exists = spawnSync(bin("psql"), ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${dbName}'`], { encoding: "utf8" });
  if (!exists.stdout.trim()) run(bin("createdb"), ["-h", "127.0.0.1", "-p", port, "-U", "postgres", dbName]);
  console.log(`Postgres ready: postgresql://postgres@127.0.0.1:${port}/${dbName}`);
} else if (action === "stop") {
  process.exit(run(bin("pg_ctl"), ["-D", dataDir, "-m", "fast", "stop"]));
} else if (action === "status") {
  console.log(isReady() ? "running" : "stopped");
} else {
  console.error("Unknown action. Use start|stop|status");
  process.exit(1);
}
