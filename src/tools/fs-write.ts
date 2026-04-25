import * as vscode from "vscode";
import * as path from "node:path";
import { ToolHandler } from "../core/types.js";
import { isProtectedPath } from "../core/permissions.js";
import { previewAndApply } from "../services/diff.js";

export const fsWrite: ToolHandler = {
  def: {
    name: "fs_write",
    description:
      "Propose writing full content to a file. Shows a diff preview; user approves or rejects.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative path." },
        content: { type: "string", description: "Full new file content." }
      },
      required: ["path", "content"]
    }
  },
  needsApproval: () => true,
  async run(input, ctx) {
    const rel = String(input.path);
    const content = String(input.content ?? "");
    const abs = path.resolve(ctx.workspaceRoot, rel);
    if (!abs.startsWith(ctx.workspaceRoot)) throw new Error("Path escapes workspace.");
    if (isProtectedPath(rel)) throw new Error(`Protected path blocked: ${rel}`);

    const dir = path.dirname(abs);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));

    const result = await previewAndApply(abs, content);
    if (result === "applied") return `Wrote ${rel} (${content.length} bytes).`;
    return `User rejected changes to ${rel}.`;
  }
};
