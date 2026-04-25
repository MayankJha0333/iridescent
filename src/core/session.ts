import { ContentBlock, Message, TimelineEvent } from "./types.js";
import { randomUUID } from "node:crypto";

export type SessionListener = (e: TimelineEvent) => void;
export type UserTurnHook = (eventId: string) => void | Promise<void>;

export class Session {
  readonly id: string;
  readonly createdAt: number;
  messages: Message[] = [];
  timeline: TimelineEvent[] = [];
  private listener?: SessionListener;
  private userTurnHook?: UserTurnHook;

  constructor(public title = "Untitled") {
    this.id = randomUUID();
    this.createdAt = Date.now();
  }

  onEvent(fn: SessionListener) {
    this.listener = fn;
  }

  onUserTurn(fn: UserTurnHook) {
    this.userTurnHook = fn;
  }

  addUser(text: string) {
    this.messages.push({ role: "user", content: text });
    const ev = this.emit({ kind: "user", title: "User", body: text });
    void this.userTurnHook?.(ev.id);
  }

  addAssistantBlocks(blocks: ContentBlock[]) {
    this.messages.push({ role: "assistant", content: blocks });
    for (const b of blocks) {
      if (b.type === "text") this.emit({ kind: "assistant", title: "Assistant", body: b.text });
      else if (b.type === "tool_use")
        this.emit({
          kind: "tool_call",
          title: `Tool: ${b.name}`,
          body: JSON.stringify(b.input),
          meta: { id: b.id, name: b.name }
        });
    }
  }

  emitToolCall(id: string, name: string, input: Record<string, unknown>) {
    this.emit({
      kind: "tool_call",
      title: `Tool: ${name}`,
      body: JSON.stringify(input),
      meta: { id, name }
    });
  }

  addToolResult(toolUseId: string, content: string, isError = false) {
    const block: ContentBlock = { type: "tool_result", tool_use_id: toolUseId, content, is_error: isError };
    this.messages.push({ role: "user", content: [block] });
    this.emit({
      kind: "tool_result",
      title: isError ? "Tool Error" : "Tool Result",
      body: content,
      meta: { id: toolUseId }
    });
  }

  emit(e: Omit<TimelineEvent, "id" | "ts">): TimelineEvent {
    const full: TimelineEvent = { id: randomUUID(), ts: Date.now(), ...e };
    this.timeline.push(full);
    this.listener?.(full);
    return full;
  }

  /** Truncate timeline + messages to state *just before* the given user event. Returns surviving timeline. */
  truncateAt(userEventId: string): TimelineEvent[] {
    const idx = this.timeline.findIndex((e) => e.id === userEventId);
    if (idx === -1) return this.timeline.slice();
    this.timeline = this.timeline.slice(0, idx);
    // Rebuild messages from surviving timeline events.
    const newMessages: Message[] = [];
    for (const e of this.timeline) {
      if (e.kind === "user" && typeof e.body === "string") {
        newMessages.push({ role: "user", content: e.body });
      } else if (e.kind === "assistant" && typeof e.body === "string") {
        const last = newMessages[newMessages.length - 1];
        if (last?.role === "assistant" && Array.isArray(last.content)) {
          (last.content as ContentBlock[]).push({ type: "text", text: e.body });
        } else {
          newMessages.push({ role: "assistant", content: [{ type: "text", text: e.body }] });
        }
      }
    }
    this.messages = newMessages;
    return this.timeline.slice();
  }
}
