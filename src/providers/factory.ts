import { ChatProvider } from "./base.js";
import { AnthropicProvider } from "./anthropic.js";
import { ClaudeCliProvider } from "./claude-cli.js";
import { PermissionMode } from "../core/types.js";

export type AuthMode = "subscription" | "apikey";

export interface ProviderContext {
  authMode: AuthMode;
  apiKey?: string;
  claudeBinary?: string;
  cwd: string;
  permissionMode?: PermissionMode;
  allowedBashPatterns?: string[];
  getResumeSessionId?: () => string | undefined;
  setResumeSessionId?: (id: string) => void;
}

export function createProvider(ctx: ProviderContext): ChatProvider {
  if (ctx.authMode === "subscription") {
    if (!ctx.claudeBinary) throw new Error("Claude CLI not found.");
    return new ClaudeCliProvider({
      binary: ctx.claudeBinary,
      cwd: ctx.cwd,
      permissionMode: ctx.permissionMode,
      allowedBashPatterns: ctx.allowedBashPatterns,
      getResumeSessionId: ctx.getResumeSessionId,
      setResumeSessionId: ctx.setResumeSessionId
    });
  }
  if (!ctx.apiKey) throw new Error("API key missing.");
  return new AnthropicProvider(ctx.apiKey);
}
