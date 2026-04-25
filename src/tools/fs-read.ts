import * as vscode from "vscode";
import * as path from "node:path";
import { ToolHandler } from "../core/types.js";
import { isProtectedPath } from "../core/permissions.js";

const MAX_BYTES = 256 * 1024;

export const fsRead: ToolHandler = {
  def: {
    name: "fs_read",
    description: "Read a text file from the workspace. Path is workspace-relative.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative path." },
        start_line: { type: "number" },
        end_line: { type: "number" }
      },
      required: ["path"]
    }
  },
  needsApproval: (input) => {
    const p = String(input.path ?? "");
    return isProtectedPath(p);
  },
  async run(input, ctx) {
    const rel = String(input.path);
    const abs = path.resolve(ctx.workspaceRoot, rel);
    if (!abs.startsWith(ctx.workspaceRoot)) throw new Error("Path escapes workspace.");
    const uri = vscode.Uri.file(abs);
    const bytes = await vscode.workspace.fs.readFile(uri);
    if (bytes.byteLength > MAX_BYTES) {
      return `[file too large: ${bytes.byteLength} bytes; max ${MAX_BYTES}]`;
    }
    let text = new TextDecoder().decode(bytes);
    const start = typeof input.start_line === "number" ? Math.max(1, input.start_line) : undefined;
    const end = typeof input.end_line === "number" ? input.end_line : undefined;
    if (start || end) {
      const lines = text.split("\n");
      const slice = lines.slice((start ?? 1) - 1, end ?? lines.length);
      text = slice.map((l, i) => `${(start ?? 1) + i}\t${l}`).join("\n");
    }
    return text;
  }
};
