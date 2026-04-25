import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  TextBlockParam,
  ToolUseBlockParam,
  ToolResultBlockParam,
  Tool as AnthropicTool
} from "@anthropic-ai/sdk/resources/messages";
import { ChatProvider, ProviderRequest } from "./base.js";
import { ContentBlock, Message, StreamDelta } from "../core/types.js";

type ContentBlockParam = TextBlockParam | ToolUseBlockParam | ToolResultBlockParam;

const MAX_RETRIES = 4;

export class AnthropicProvider implements ChatProvider {
  readonly id = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
  }

  async *stream(req: ProviderRequest): AsyncIterable<StreamDelta> {
    const params = {
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      tools: req.tools.map<AnthropicTool>((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as AnthropicTool.InputSchema
      })),
      messages: req.messages.map(toAnthropicMessage)
    };

    let attempt = 0;
    while (true) {
      try {
        const stream = this.client.messages.stream(params);
        for await (const event of stream) {
          switch (event.type) {
            case "content_block_start":
              if (event.content_block.type === "tool_use") {
                yield {
                  type: "tool_use_start",
                  tool: { id: event.content_block.id, name: event.content_block.name }
                };
              }
              break;
            case "content_block_delta":
              if (event.delta.type === "text_delta") {
                yield { type: "text", text: event.delta.text };
              } else if (event.delta.type === "input_json_delta") {
                yield { type: "tool_use_input", partialInput: event.delta.partial_json };
              }
              break;
            case "content_block_stop":
              yield { type: "tool_use_end" };
              break;
            case "message_stop":
              yield { type: "done" };
              break;
          }
        }
        return;
      } catch (err) {
        const info = parseError(err);

        if (info.status === 429 && attempt < MAX_RETRIES) {
          const waitMs = info.retryAfterMs ?? backoffMs(attempt);
          yield {
            type: "text",
            text: `\n[rate limited — retrying in ${Math.round(waitMs / 1000)}s (${
              attempt + 1
            }/${MAX_RETRIES})]\n`
          };
          await sleep(waitMs);
          attempt++;
          continue;
        }

        if ((info.status === 529 || info.status === 503) && attempt < MAX_RETRIES) {
          const waitMs = backoffMs(attempt);
          yield { type: "text", text: `\n[overloaded — retry in ${Math.round(waitMs / 1000)}s]\n` };
          await sleep(waitMs);
          attempt++;
          continue;
        }

        yield { type: "error", error: humanize(info) };
        return;
      }
    }
  }
}

interface ErrInfo {
  status?: number;
  message: string;
  type?: string;
  retryAfterMs?: number;
}

function parseError(err: unknown): ErrInfo {
  const e = err as {
    status?: number;
    message?: string;
    headers?: Record<string, string>;
    error?: { error?: { type?: string; message?: string } };
  };
  if (e && typeof e.status === "number") {
    const headers = e.headers ?? {};
    const retryAfter = headers["retry-after"] ?? headers["Retry-After"];
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
    const body = e.error;
    return {
      status: e.status,
      message: body?.error?.message || e.message || "",
      type: body?.error?.type,
      retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined
    };
  }
  if (err instanceof Error) return { message: err.message };
  return { message: String(err) };
}

function backoffMs(attempt: number): number {
  const base = 1000 * 2 ** attempt;
  const jitter = Math.random() * 400;
  return Math.min(base + jitter, 30_000);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function humanize(info: ErrInfo): string {
  if (info.status === 429) return `Rate limited (429). ${info.message}`;
  if (info.status === 401 || info.status === 403)
    return `Auth rejected (${info.status}). Token invalid. Logout and reconnect. ${info.message}`;
  if (info.status === 529 || info.status === 503)
    return `Anthropic API overloaded (${info.status}). Try again shortly. ${info.message}`;
  if (info.status) return `${info.status} ${info.type ?? ""}: ${info.message}`.trim();
  return info.message;
}

function toAnthropicMessage(m: Message): MessageParam {
  if (typeof m.content === "string") {
    return { role: m.role === "assistant" ? "assistant" : "user", content: m.content };
  }
  const blocks: ContentBlockParam[] = m.content.map<ContentBlockParam>((b: ContentBlock) => {
    if (b.type === "text") return { type: "text", text: b.text };
    if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input };
    return { type: "tool_result", tool_use_id: b.tool_use_id, content: b.content, is_error: b.is_error };
  });
  return { role: m.role === "assistant" ? "assistant" : "user", content: blocks };
}
