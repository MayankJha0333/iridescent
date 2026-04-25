import { Message, StreamDelta, ToolDefinition } from "../core/types.js";

export interface ProviderRequest {
  model: string;
  maxTokens: number;
  system: string;
  messages: Message[];
  tools: ToolDefinition[];
}

export interface ChatProvider {
  readonly id: string;
  stream(req: ProviderRequest): AsyncIterable<StreamDelta>;
}
