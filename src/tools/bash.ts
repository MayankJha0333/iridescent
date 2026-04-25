import * as vscode from "vscode";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { ToolHandler } from "../core/types.js";

const pexec = promisify(exec);
const TIMEOUT_MS = 60_000;
const MAX_OUT = 100_000;

export const bash: ToolHandler = {
  def: {
    name: "bash",
    description:
      "Execute a bash command in the workspace root. Shown in integrated terminal for transparency; captured output returned.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        description: { type: "string" }
      },
      required: ["command"]
    }
  },
  needsApproval: () => true,
  async run(input, ctx) {
    const command = String(input.command);

    const term = vscode.window.createTerminal({
      name: "Iridescent",
      cwd: ctx.workspaceRoot
    });
    term.show(true);
    term.sendText(`# [iridescent] ${command}`, true);

    try {
      const { stdout, stderr } = await pexec(command, {
        cwd: ctx.workspaceRoot,
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_OUT
      });
      let out = stdout;
      if (stderr) out += `\n[stderr]\n${stderr}`;
      if (out.length > MAX_OUT) out = out.slice(0, MAX_OUT) + "\n[truncated]";
      return out || "(no output)";
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
      const body =
        `exit ${e.code ?? "?"}\n` +
        (e.stdout ? `[stdout]\n${e.stdout}\n` : "") +
        (e.stderr ? `[stderr]\n${e.stderr}\n` : "") +
        (e.message ?? "");
      return body.slice(0, MAX_OUT);
    }
  }
};
