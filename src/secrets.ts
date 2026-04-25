import * as vscode from "vscode";
import { AuthMode } from "./providers/factory.js";

const keyFor = (provider: string) => `iridescent.apiKey.${provider}`;
const AUTH_MODE_KEY = "iridescent.authMode";

export async function getApiKey(
  ctx: vscode.ExtensionContext,
  provider: string
): Promise<string | undefined> {
  return ctx.secrets.get(keyFor(provider));
}

export async function storeApiKey(
  ctx: vscode.ExtensionContext,
  provider: string,
  key: string
) {
  await ctx.secrets.store(keyFor(provider), key);
}

export async function deleteApiKey(
  ctx: vscode.ExtensionContext,
  provider: string
) {
  await ctx.secrets.delete(keyFor(provider));
}

export function getAuthMode(ctx: vscode.ExtensionContext): AuthMode | undefined {
  return ctx.globalState.get<AuthMode>(AUTH_MODE_KEY);
}

export async function setAuthMode(ctx: vscode.ExtensionContext, mode: AuthMode) {
  await ctx.globalState.update(AUTH_MODE_KEY, mode);
}

export async function clearAuthMode(ctx: vscode.ExtensionContext) {
  await ctx.globalState.update(AUTH_MODE_KEY, undefined);
}

export async function setApiKey(ctx: vscode.ExtensionContext) {
  const key = await vscode.window.showInputBox({
    prompt: "Anthropic Console API key (sk-ant-api03-…)",
    password: true,
    ignoreFocusOut: true
  });
  if (!key) return;
  await storeApiKey(ctx, "anthropic", key);
  await setAuthMode(ctx, "apikey");
  vscode.window.showInformationMessage("Iridescent: API key stored.");
}

export async function validateAnthropicKey(
  key: string
): Promise<{ ok: boolean; error?: string }> {
  if (!key.startsWith("sk-ant-api")) {
    return {
      ok: false,
      error:
        "Only Anthropic Console API keys (sk-ant-api03-…) are supported here. For Claude Pro/Max subscriptions, use the Subscription tab (requires the claude CLI)."
    };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }]
      })
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Invalid API key (${res.status}). ${text.slice(0, 160)}` };
    }
    const bodyText = await res.text().catch(() => "");
    if (res.status === 404 || /model/i.test(bodyText)) return { ok: true };
    return { ok: false, error: `HTTP ${res.status}: ${bodyText.slice(0, 200)}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Network error: ${msg}` };
  }
}
