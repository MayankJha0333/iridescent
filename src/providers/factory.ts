import * as path from "node:path";
import { ChatProvider } from "./base.js";
import { AnthropicProvider } from "./anthropic.js";
import { ClaudeCliProvider } from "./claude-cli.js";
import { PermissionMode } from "../core/types.js";

export type AuthMode = "subscription" | "apikey";

export interface ProviderContext {
  authMode: AuthMode;
  apiKey?: string;
  cwd: string;
  permissionMode?: PermissionMode;
  allowedBashPatterns?: string[];
  /** Skill ids the user has toggled OFF in the picker. Subscription mode
   *  enforces them via --disallowedTools + --append-system-prompt. */
  disabledSkills?: string[];
  getResumeSessionId?: () => string | undefined;
  setResumeSessionId?: (id: string) => void;
}

// The Claude CLI ships inside the extension via the
// `@anthropic-ai/claude-code` npm dep. Its postinstall copies the
// platform-native binary to bin/claude.exe — same filename on every OS.
// Resolved relative to the compiled extension entry (dist/extension.js)
// so it works both in dev (F5) and inside a packaged .vsix.
function bundledClaudeBinary(): string {
  return path.resolve(
    __dirname,
    "..",
    "node_modules",
    "@anthropic-ai",
    "claude-code",
    "bin",
    "claude.exe"
  );
}

export function createProvider(ctx: ProviderContext): ChatProvider {
  if (ctx.authMode === "subscription") {
    return new ClaudeCliProvider({
      binary: bundledClaudeBinary(),
      cwd: ctx.cwd,
      permissionMode: ctx.permissionMode,
      allowedBashPatterns: ctx.allowedBashPatterns,
      disabledSkills: ctx.disabledSkills,
      getResumeSessionId: ctx.getResumeSessionId,
      setResumeSessionId: ctx.setResumeSessionId
    });
  }
  if (!ctx.apiKey) throw new Error("API key missing.");
  return new AnthropicProvider(ctx.apiKey);
}
