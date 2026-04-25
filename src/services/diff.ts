import * as vscode from "vscode";

const VIRTUAL_SCHEME = "iridescent-diff";

class ProposedContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  onDidChange = this._onDidChange.event;
  private contents = new Map<string, string>();

  set(key: string, text: string) {
    this.contents.set(key, text);
    this._onDidChange.fire(vscode.Uri.parse(`${VIRTUAL_SCHEME}:${key}`));
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.path) ?? "";
  }
}

let provider: ProposedContentProvider | null = null;

export function registerDiffProvider(ctx: vscode.ExtensionContext) {
  provider = new ProposedContentProvider();
  ctx.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(VIRTUAL_SCHEME, provider)
  );
}

export async function previewAndApply(
  targetPath: string,
  newContent: string
): Promise<"applied" | "rejected"> {
  if (!provider) throw new Error("Diff provider not registered");

  const targetUri = vscode.Uri.file(targetPath);
  const key = `${Date.now()}-${encodeURIComponent(targetPath)}`;
  provider.set(key, newContent);
  const rightUri = vscode.Uri.parse(`${VIRTUAL_SCHEME}:${key}`);

  let existingUri: vscode.Uri | null = targetUri;
  try {
    await vscode.workspace.fs.stat(targetUri);
  } catch {
    existingUri = null;
  }

  const leftUri = existingUri ?? vscode.Uri.parse(`${VIRTUAL_SCHEME}:empty-${key}`);
  if (!existingUri) provider.set(`empty-${key}`, "");

  await vscode.commands.executeCommand(
    "vscode.diff",
    leftUri,
    rightUri,
    `Iridescent · ${targetPath.split("/").pop()} (proposed)`,
    { preview: true }
  );

  const pick = await vscode.window.showInformationMessage(
    `Apply changes to ${targetPath.split("/").pop()}?`,
    { modal: false },
    "Apply",
    "Reject"
  );

  if (pick === "Apply") {
    const enc = new TextEncoder();
    await vscode.workspace.fs.writeFile(targetUri, enc.encode(newContent));
    return "applied";
  }
  return "rejected";
}
