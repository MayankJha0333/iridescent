import { exec } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(exec);

export interface CliStatus {
  installed: boolean;
  loggedIn: boolean;
  version?: string;
  path?: string;
  error?: string;
}

export async function quickCheckCliBinary(): Promise<{ path?: string; version?: string }> {
  const which = await run("command -v claude || which claude");
  if (!which.ok || !which.stdout.trim()) return {};
  const path = which.stdout.trim().split("\n")[0];
  const ver = await run(`"${path}" --version`, 3000);
  return {
    path,
    version: ver.ok ? ver.stdout.trim().split(/\s+/).pop() : undefined
  };
}

export async function detectClaudeCli(): Promise<CliStatus> {
  const which = await run("command -v claude || which claude");
  if (!which.ok || !which.stdout.trim()) {
    return { installed: false, loggedIn: false };
  }
  const binPath = which.stdout.trim().split("\n")[0];

  const ver = await run(`"${binPath}" --version`, 5000);
  if (!ver.ok) {
    return {
      installed: true,
      loggedIn: false,
      path: binPath,
      error: `claude --version failed: ${ver.stderr || ver.stdout}`
    };
  }
  const version = ver.stdout.trim().split(/\s+/).pop();

  const probe = await run(
    `"${binPath}" -p "ok" --output-format json --max-turns 1`,
    15000
  );
  if (!probe.ok) {
    const combined = `${probe.stdout}\n${probe.stderr}`.toLowerCase();
    if (/log ?in|not authenticated|invalid api key|unauthoriz/.test(combined)) {
      return { installed: true, loggedIn: false, version, path: binPath };
    }
    return {
      installed: true,
      loggedIn: false,
      version,
      path: binPath,
      error: probe.stderr || probe.stdout
    };
  }
  return { installed: true, loggedIn: true, version, path: binPath };
}

interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

async function run(cmd: string, timeoutMs = 8000): Promise<RunResult> {
  try {
    const { stdout, stderr } = await pexec(cmd, {
      timeout: timeoutMs,
      shell: "/bin/bash"
    });
    return { ok: true, stdout, stderr };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, stdout: e.stdout ?? "", stderr: e.stderr ?? e.message ?? "" };
  }
}
