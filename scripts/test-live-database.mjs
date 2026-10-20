import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import pg from "pg";
import { assertOwnedLocalDatabase, verifyOwnedLocalDatabase } from "./local-database-guard.mjs";

const exec = promisify(execFile);
const childArguments = ["--conditions=react-server", "--import", "./scripts/local-database-preload.mjs", "--import", "tsx"];

async function runChild(args, env, onChild = () => {}) {
  const child = spawn(process.execPath, args, { env, stdio: "inherit" });
  onChild(child);
  const onInterrupt = () => child.kill("SIGINT");
  const onTerminate = () => child.kill("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => signal ? reject(new Error(`Local database regression interrupted by ${signal}`)) : resolve(code));
    });
    assert.equal(code, 0, "Local PostgreSQL regression failed");
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
    onChild(undefined);
  }
}

async function runRegression() {
  await verifyOwnedLocalDatabase();
  const { migrateDatabase, importApprovedLogo } = await import("./migrate-database.ts");
  const { neonMediaUrl } = await import("../src/config/site.ts");
  const connection = process.env.DATABASE_URL;
  await migrateDatabase(connection);
  // Reapply to check migration hashes and brochure/root seed idempotency.
  await migrateDatabase(connection);
  // Independently read from the approved PNG on 2026-10-15. This relational
  // metadata fixture keeps ordinary tests offline; live smoke verifies delivery.
  const publicUrl = neonMediaUrl("client-reference/legacy/logo-without-text.png");
  await importApprovedLogo(connection, {
    publicUrl,
    bytes: 25230,
    sha256: "67294e15a323245234b9d7fe1876f0757910b0b277f9d28ccf2fd1afdd71c24a",
  });
  await runChild([...childArguments, "--test", "tests/live-workspace.test.ts"], { ...process.env, APPROVED_LOGO_URL: publicUrl });
  await runChild([...childArguments, "--test", "tests/contact-outbox.test.ts"], { ...process.env, APPROVED_LOGO_URL: publicUrl });
  await runChild([...childArguments, "--test", "tests/email-notifications.test.ts"], { ...process.env });
}

async function availablePort() {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return address.port;
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function runOwnedCluster() {
  const nonce = randomBytes(16).toString("hex");
  const port = await availablePort();
  const root = await mkdtemp(join(await realpath(tmpdir()), `le-grande-pg-${nonce}-`));
  const dataDir = join(root, "data");
  const database = `regression_${nonce}`;
  const user = `owner_${nonce}`;
  const password = randomBytes(32).toString("hex");
  const manifest = { nonce, dataDir, database, user, port, passwordHash: createHash("sha256").update(password).digest("hex") };
  const passwordFile = join(root, "init-password");
  const connection = new URL(`postgresql://${user}:${password}@127.0.0.1:${port}/${database}?sslmode=disable`);
  // Do not inherit DATABASE_URL, PG*, NODE_OPTIONS or private/live service env.
  const env = Object.fromEntries(["PATH", "HOME", "USER", "TMPDIR", "TEMP", "TMP", "SystemRoot", "TERM", "FORCE_COLOR"].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  Object.assign(env, { DATABASE_URL: connection.href, RUN_LOCAL_DATABASE_TESTS: "1", LOCAL_DATABASE_TEST_NONCE: nonce, LOCAL_DATABASE_TEST_ROOT: root, LC_ALL: "C", LANG: "C" });
  let child;
  let interrupted;
  const onSignal = signal => { interrupted = signal; child?.kill(signal); };
  const onInterrupt = () => onSignal("SIGINT");
  const onTerminate = () => onSignal("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  let initialized = false;
  let startAttempted = false;
  try {
    await writeFile(join(root, "owner.json"), JSON.stringify(manifest), { mode: 0o600 });
    await writeFile(passwordFile, password + "\n", { mode: 0o600 });
    await exec("initdb", ["-D", dataDir, "--username", user, "--pwfile", passwordFile, "--auth-host=scram-sha-256", "--auth-local=trust", "--encoding=UTF8", "--no-locale"], { env });
    initialized = true;
    await rm(passwordFile);
    // Disable Unix sockets so this cluster is reachable only on its unique TCP endpoint.
    const configPath = join(dataDir, "postgresql.conf");
    await writeFile(configPath, await readFile(configPath, "utf8") + `\nlisten_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = ''\n`);
    if (interrupted) throw new Error(`Local database setup interrupted by ${interrupted}`);
    startAttempted = true;
    await exec("pg_ctl", ["-D", dataDir, "-l", join(root, "postgres.log"), "-w", "-t", "30", "start"], { env });
    const pool = new pg.Pool({ connectionString: connection.href.replace(`/${database}?`, "/postgres?"), max: 1 });
    try {
      // Identifiers contain only fixed prefixes and our cryptographically random hex nonce.
      await pool.query(`CREATE DATABASE "${database}"`);
    } finally {
      await pool.end();
    }
    if (interrupted) throw new Error(`Local database setup interrupted by ${interrupted}`);
    console.log(`Owned local PostgreSQL regression: ${database} on 127.0.0.1:${port}`);
    await runChild([...childArguments, "scripts/test-live-database.mjs", "--owned-local-worker"], env, value => { child = value; });
  } catch (error) {
    // Local subprocesses receive no live credentials; retain useful stderr without connection URLs.
    if (error?.cmd) {
      const serverLog = await readFile(join(root, "postgres.log"), "utf8").catch(() => "");
      const detail = [error.stderr, serverLog].filter(Boolean).join("\n").replace(/postgres(?:ql)?:\/\/\S+/g, "[REDACTED]").trim();
      throw new Error(`Local PostgreSQL setup failed (${error.code ?? "unknown"}): ${detail || "check initdb/pg_ctl/postgres on PATH"}`);
    }
    throw error;
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
    const owner = JSON.parse(await readFile(join(root, "owner.json"), "utf8"));
    assert.deepEqual(owner, manifest, "Only this run's owned cluster may be stopped or removed");
    if (initialized && startAttempted) {
      // pg_ctl targets this exact dataDir, never a system/existing PostgreSQL service.
      await exec("pg_ctl", ["-D", dataDir, "-w", "-t", "30", "-m", "fast", "stop"], { env }).catch(async error => {
        // A failed start has no server to stop; do not erase an actually running cluster.
        const pidFile = await readFile(join(dataDir, "postmaster.pid"), "utf8").catch(() => "");
        if (pidFile) throw new Error(`Owned local PostgreSQL could not stop; retained ${root} for safe cleanup`, { cause: error });
      });
    }
    await rm(root, { recursive: true });
    console.log("Removed owned local PostgreSQL cluster.");
  }
}

if (process.argv.includes("--owned-local-worker")) {
  assertOwnedLocalDatabase();
  await runRegression();
} else {
  await runOwnedCluster();
}
