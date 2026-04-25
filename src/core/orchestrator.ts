import { ContentBlock, StreamDelta, ToolHandler, ToolContext, ToolDefinition } from "./types.js";
import { Session } from "./session.js";
import { Approver, PermissionGate, check, isDestructiveBash, isProtectedPath } from "./permissions.js";
import { ChatProvider, ProviderRequest } from "../providers/base.js";

export interface OrchestratorOpts {
  provider: ChatProvider;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  tools: Record<string, ToolHandler>;
  gate: PermissionGate;
  approve: Approver;
  ctx: ToolContext;
  onDelta?: (d: StreamDelta) => void;
  /** When true, provider owns tool execution. Orchestrator passes through tool_use + tool_result as timeline events and does not re-run tools. */
  externalToolExecution?: boolean;
}

const MAX_STEPS = 25;

export class Orchestrator {
  cancelled = false;

  constructor(private session: Session, private o: OrchestratorOpts) {}

  cancel() {
    this.cancelled = true;
  }

  async turn(userText: string): Promise<void> {
    this.session.addUser(userText);

    if (this.o.externalToolExecution) {
      await this.runExternal();
      return;
    }

    await this.runInternal();
  }

  private async runExternal(): Promise<void> {
    const req: ProviderRequest = {
      model: this.o.model,
      maxTokens: this.o.maxTokens,
      system: this.o.systemPrompt,
      messages: this.session.messages,
      tools: []
    };

    const blocks: ContentBlock[] = [];
    let currentTool: { id: string; name: string; inputBuf: string } | null = null;
    const seenAssistantBlockIds = new Set<string>();

    for await (const delta of this.o.provider.stream(req)) {
      if (this.cancelled) return;
      this.o.onDelta?.(delta);
      switch (delta.type) {
        case "text":
          if (delta.text) {
            const last = blocks[blocks.length - 1];
            if (last && last.type === "text") last.text += delta.text;
            else blocks.push({ type: "text", text: delta.text });
          }
          break;
        case "tool_use_start":
          currentTool = { id: delta.tool!.id, name: delta.tool!.name, inputBuf: "" };
          break;
        case "tool_use_input":
          if (currentTool) currentTool.inputBuf += delta.partialInput ?? "";
          break;
        case "tool_use_end":
          if (currentTool) {
            let input: Record<string, unknown> = {};
            try {
              input = currentTool.inputBuf ? JSON.parse(currentTool.inputBuf) : {};
            } catch {
              input = {};
            }
            const block: ContentBlock = {
              type: "tool_use",
              id: currentTool.id,
              name: currentTool.name,
              input
            };
            blocks.push(block);
            if (!seenAssistantBlockIds.has(currentTool.id)) {
              seenAssistantBlockIds.add(currentTool.id);
              this.session.emitToolCall(currentTool.id, currentTool.name, input);
            }
            currentTool = null;
          }
          break;
        case "tool_result":
          if (delta.toolUseId) {
            this.session.addToolResult(
              delta.toolUseId,
              delta.resultContent ?? "",
              !!delta.resultIsError
            );
          }
          break;
        case "error":
          this.session.emit({ kind: "error", title: "Provider error", body: delta.error });
          return;
      }
    }

    const textBlocks = blocks.filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text");
    if (textBlocks.length > 0) {
      this.session.messages.push({ role: "assistant", content: textBlocks });
      for (const tb of textBlocks) {
        this.session.emit({ kind: "assistant", title: "Assistant", body: tb.text });
      }
    }
  }

  private async runInternal(): Promise<void> {
    const toolDefs: ToolDefinition[] = Object.values(this.o.tools).map((t) => t.def);

    for (let step = 0; step < MAX_STEPS; step++) {
      if (this.cancelled) return;

      const req: ProviderRequest = {
        model: this.o.model,
        maxTokens: this.o.maxTokens,
        system: this.o.systemPrompt,
        messages: this.session.messages,
        tools: toolDefs
      };

      const blocks: ContentBlock[] = [];
      let currentTool: { id: string; name: string; inputBuf: string } | null = null;

      for await (const delta of this.o.provider.stream(req)) {
        if (this.cancelled) return;
        this.o.onDelta?.(delta);
        switch (delta.type) {
          case "text":
            if (delta.text) {
              const last = blocks[blocks.length - 1];
              if (last && last.type === "text") last.text += delta.text;
              else blocks.push({ type: "text", text: delta.text });
            }
            break;
          case "tool_use_start":
            currentTool = { id: delta.tool!.id, name: delta.tool!.name, inputBuf: "" };
            break;
          case "tool_use_input":
            if (currentTool) currentTool.inputBuf += delta.partialInput ?? "";
            break;
          case "tool_use_end":
            if (currentTool) {
              let input: Record<string, unknown> = {};
              try {
                input = currentTool.inputBuf ? JSON.parse(currentTool.inputBuf) : {};
              } catch {
                input = {};
              }
              blocks.push({ type: "tool_use", id: currentTool.id, name: currentTool.name, input });
              currentTool = null;
            }
            break;
          case "error":
            this.session.emit({ kind: "error", title: "Provider error", body: delta.error });
            return;
        }
      }

      this.session.addAssistantBlocks(blocks);

      const toolUses = blocks.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
      if (toolUses.length === 0) return;

      for (const tu of toolUses) {
        if (this.cancelled) return;
        const handler = this.o.tools[tu.name];
        if (!handler) {
          this.session.addToolResult(tu.id, `Unknown tool: ${tu.name}`, true);
          continue;
        }

        const destructive = detectDestructive(tu.name, tu.input);
        const approved = await check(
          this.o.gate,
          { tool: tu.name, input: tu.input, summary: summarize(tu.name, tu.input), destructive },
          this.o.approve
        );

        if (!approved) {
          this.session.addToolResult(tu.id, "User denied this action.", true);
          continue;
        }

        try {
          const result = await handler.run(tu.input, this.o.ctx);
          this.session.addToolResult(tu.id, result, false);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.session.addToolResult(tu.id, msg, true);
        }
      }
    }
  }
}

function summarize(name: string, input: Record<string, unknown>): string {
  if (name === "fs_read" || name === "fs_write") return `${name} ${String(input.path ?? "")}`;
  if (name === "bash") return `bash: ${String(input.command ?? "")}`;
  return name;
}

function detectDestructive(name: string, input: Record<string, unknown>): boolean {
  if (name === "bash" && typeof input.command === "string" && isDestructiveBash(input.command)) return true;
  if ((name === "fs_write" || name === "fs_read") && typeof input.path === "string" && isProtectedPath(input.path))
    return true;
  return false;
}
