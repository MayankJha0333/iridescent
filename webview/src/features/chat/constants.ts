// ─────────────────────────────────────────────────────────────
// Chat-feature constants. The MODELS list is now the *fallback*
// only — the live list comes from the extension via the `models`
// RPC, which knows the connected provider's capabilities.
// ─────────────────────────────────────────────────────────────

import type { PermissionMode, ModelInfo } from "../../lib/rpc";
import type { IconName } from "../../design/icons";

export const FALLBACK_MODELS: ReadonlyArray<ModelInfo> = [
  { value: "claude-opus-4-7",   label: "Opus 4.7",   note: "best reasoning",      supportsTools: true, group: "version" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "balanced",            supportsTools: true, group: "version" },
  { value: "claude-haiku-4-5",  label: "Haiku 4.5",  note: "fastest · low cost",  supportsTools: true, group: "version" }
];

export interface ModeOption {
  value: PermissionMode;
  label: string;
  short: string;
  note: string;
  icon: IconName;
}

export const MODES: ReadonlyArray<ModeOption> = [
  { value: "default", label: "Ask",   short: "Ask",   note: "Conversational · approve every action",        icon: "book"   },
  { value: "auto",    label: "Agent", short: "Agent", note: "Autonomous · auto-runs safe reads & commands", icon: "bolt"   },
  { value: "plan",    label: "Plan",  short: "Plan",  note: "Read-only · drafts a step-by-step plan",        icon: "layers" }
];

export function findMode(value: PermissionMode | string | undefined): ModeOption {
  return MODES.find((m) => m.value === value) ?? MODES[0];
}

export function findModel(
  models: ReadonlyArray<ModelInfo>,
  value: string | undefined
): ModelInfo {
  const fromList = models.find((m) => m.value === value);
  if (fromList) return fromList;
  return {
    value: value ?? "",
    label: shortModel(value ?? ""),
    note: "",
    supportsTools: true,
    group: "version"
  };
}

function shortModel(m: string): string {
  return m.replace(/^claude-/, "").replace(/-\d{8}$/, "").replace(/-latest$/, "");
}
