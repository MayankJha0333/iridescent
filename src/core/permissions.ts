import { PermissionMode } from "./types.js";

const PROTECTED_PATHS = [
  /(^|\/)\.git(\/|$)/,
  /(^|\/)\.vscode(\/|$)/,
  /(^|\/)\.env(\..+)?$/,
  /(^|\/)\.ssh(\/|$)/,
  /(^|\/)\.(bash|zsh)rc$/,
  /(^|\/)\.(bash|zsh)_profile$/
];

const DESTRUCTIVE_BASH = [
  /\brm\s+-rf\b/,
  /\bgit\s+push\s+(-f|--force)/,
  /\bDROP\s+(TABLE|DATABASE)\b/i,
  /\bmkfs\b/,
  /:\(\)\{\s*:\|\s*:&\s*\};/,
  />\s*\/dev\/sd/
];

export function isProtectedPath(p: string): boolean {
  return PROTECTED_PATHS.some((r) => r.test(p));
}

export function isDestructiveBash(cmd: string): boolean {
  return DESTRUCTIVE_BASH.some((r) => r.test(cmd));
}

export interface ApprovalRequest {
  tool: string;
  summary: string;
  input: Record<string, unknown>;
  destructive: boolean;
}

export type Approver = (req: ApprovalRequest) => Promise<"once" | "always" | "deny">;

export interface PermissionGate {
  mode: PermissionMode;
  allowed: Set<string>;
  bashAllowlist: RegExp[];
}

export function createGate(mode: PermissionMode, bashAllowlist: string[]): PermissionGate {
  return {
    mode,
    allowed: new Set<string>(),
    bashAllowlist: bashAllowlist.map((p) => new RegExp(p))
  };
}

export async function check(
  gate: PermissionGate,
  req: ApprovalRequest,
  approve: Approver
): Promise<boolean> {
  if (req.destructive) {
    const d = await approve(req);
    return d !== "deny";
  }

  if (gate.mode === "plan") return false;

  if (gate.mode === "bypass") return true;

  if (gate.allowed.has(req.tool)) return true;

  if (gate.mode === "auto") {
    if (req.tool === "bash" && typeof req.input.command === "string") {
      const cmd = req.input.command;
      if (gate.bashAllowlist.some((r) => r.test(cmd))) return true;
    } else if (req.tool === "fs_read") {
      return true;
    }
  }

  const d = await approve(req);
  if (d === "always") gate.allowed.add(req.tool);
  return d !== "deny";
}
