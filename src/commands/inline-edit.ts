import * as vscode from "vscode";
import { ChatPanelProvider } from "../ui/panel.js";

export async function inlineEditCommand(panel: ChatPanelProvider) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("Open a file first.");
    return;
  }
  const sel = editor.selection;
  const selectedText = editor.document.getText(sel);
  const filePath = vscode.workspace.asRelativePath(editor.document.uri);

  const instruction = await vscode.window.showInputBox({
    prompt: "Iridescent — what should I do?",
    placeHolder: "e.g. extract function, add error handling, rewrite async"
  });
  if (!instruction) return;

  let context = `File: ${filePath}`;
  if (selectedText) {
    context += `\nSelected lines ${sel.start.line + 1}-${sel.end.line + 1}:\n\`\`\`\n${selectedText}\n\`\`\``;
  }

  await panel.sendUserMessage(`${context}\n\nTask: ${instruction}`);
}

export async function explainCommand(panel: ChatPanelProvider) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const sel = editor.selection;
  const text = editor.document.getText(sel.isEmpty ? undefined : sel);
  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  await panel.sendUserMessage(`Explain this code from ${filePath}:\n\`\`\`\n${text}\n\`\`\``);
}

export async function refactorCommand(panel: ChatPanelProvider) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const sel = editor.selection;
  const text = editor.document.getText(sel);
  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  if (!text) {
    vscode.window.showWarningMessage("Select code to refactor.");
    return;
  }
  await panel.sendUserMessage(
    `Refactor this selection from ${filePath} (lines ${sel.start.line + 1}-${sel.end.line + 1}) for clarity and simplicity. Show the diff via fs_write.\n\`\`\`\n${text}\n\`\`\``
  );
}

export async function fixBugCommand(panel: ChatPanelProvider) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  await panel.sendUserMessage(
    `There's a bug in ${filePath}. Read the file, identify the issue, propose a fix via fs_write, then suggest a test command.`
  );
}
