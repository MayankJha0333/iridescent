import * as vscode from "vscode";
import { ChatPanelProvider } from "./ui/panel.js";
import { registerDiffProvider } from "./services/diff.js";
import { setApiKey } from "./secrets.js";
import { inlineEditCommand, explainCommand, refactorCommand, fixBugCommand } from "./commands/inline-edit.js";
import { PermissionMode } from "./core/types.js";

export function activate(ctx: vscode.ExtensionContext) {
  registerDiffProvider(ctx);

  const panel = new ChatPanelProvider(ctx);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatPanelProvider.viewId, panel, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("iridescent.newChat", () => panel.newSession()),
    vscode.commands.registerCommand("iridescent.toggleChat", () =>
      vscode.commands.executeCommand("workbench.view.extension.iridescent")
    ),
    vscode.commands.registerCommand("iridescent.inlineEdit", () => inlineEditCommand(panel)),
    vscode.commands.registerCommand("iridescent.explain", () => explainCommand(panel)),
    vscode.commands.registerCommand("iridescent.refactor", () => refactorCommand(panel)),
    vscode.commands.registerCommand("iridescent.fixBug", () => fixBugCommand(panel)),
    vscode.commands.registerCommand("iridescent.setApiKey", () => setApiKey(ctx)),
    vscode.commands.registerCommand("iridescent.cycleMode", async () => {
      const cfg = vscode.workspace.getConfiguration("iridescent");
      const order: PermissionMode[] = ["default", "plan", "auto"];
      const cur = cfg.get<PermissionMode>("permissionMode", "default");
      const next = order[(order.indexOf(cur) + 1) % order.length];
      await cfg.update("permissionMode", next, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage(`Iridescent mode: ${next}`, 2000);
    }),
    vscode.commands.registerCommand("iridescent.sendSelection", () => panel.sendSelectionToChat())
  );
}

export function deactivate() {}
