export type Role = "user" | "assistant" | "system" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  content: string;
  isError?: boolean;
}

export interface Message {
  role: Role;
  content: string | Array<ContentBlock>;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolHandler {
  def: ToolDefinition;
  needsApproval: (input: Record<string, unknown>, mode: PermissionMode) => boolean;
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}

export interface ToolContext {
  workspaceRoot: string;
  sessionId: string;
  emit: (event: TimelineEvent) => void;
}

export type PermissionMode = "default" | "plan" | "auto";

export interface StreamDelta {
  type:
    | "text"
    | "tool_use_start"
    | "tool_use_input"
    | "tool_use_end"
    | "tool_result"
    | "done"
    | "error";
  text?: string;
  tool?: { id: string; name: string };
  partialInput?: string;
  error?: string;
  toolUseId?: string;
  resultContent?: string;
  resultIsError?: boolean;
}

export interface TimelineEvent {
  id: string;
  ts: number;
  kind: "user" | "assistant" | "tool_call" | "tool_result" | "approval" | "error" | "checkpoint";
  title: string;
  body?: string;
  meta?: Record<string, unknown>;
}
