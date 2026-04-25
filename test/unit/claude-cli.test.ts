import { describe, it, expect, vi } from "vitest";
import { mapEvent, makeProcessor, buildArgs } from "../../src/providers/claude-cli.js";

describe("claude-cli mapEvent (single event)", () => {
  it("captures session_id from system/init", () => {
    const setResume = vi.fn();
    const out = mapEvent(
      { type: "system", subtype: "init", session_id: "abc-123" },
      setResume
    );
    expect(out).toEqual([]);
    expect(setResume).toHaveBeenCalledWith("abc-123");
  });

  it("maps assistant text blocks to text deltas when no partials", () => {
    const out = mapEvent({
      type: "assistant",
      message: { content: [{ type: "text", text: "hello world" }] }
    });
    expect(out).toEqual([{ type: "text", text: "hello world" }]);
  });

  it("emits tool_use_start/input/end from assistant tool_use blocks (when not already started via partials)", () => {
    const out = mapEvent({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", id: "t1", name: "Read", input: { path: "src/a.ts" } }
        ]
      }
    });
    expect(out).toEqual([
      { type: "tool_use_start", tool: { id: "t1", name: "Read" } },
      { type: "tool_use_input", partialInput: JSON.stringify({ path: "src/a.ts" }) },
      { type: "tool_use_end" }
    ]);
  });

  it("emits error on result/error subtype", () => {
    const out = mapEvent({ type: "result", subtype: "error_max_turns", result: "stopped" });
    expect(out).toEqual([{ type: "error", error: "stopped" }]);
  });

  it("ignores result/success payload", () => {
    const out = mapEvent({ type: "result", subtype: "success", result: "done task" });
    expect(out).toEqual([]);
  });

  it("emits error on top-level error event", () => {
    const out = mapEvent({ type: "error", error: "oh no" });
    expect(out).toEqual([{ type: "error", error: "oh no" }]);
  });

  it("ignores non-tool_result user content", () => {
    const out = mapEvent({ type: "user", message: { content: [{ type: "text", text: "x" }] as any } });
    expect(out).toEqual([]);
  });
});

describe("claude-cli buildArgs", () => {
  it("maps permissionMode auto -> acceptEdits", () => {
    const args = buildArgs("hi", "claude-sonnet-4-5", {
      binary: "claude",
      cwd: "/tmp",
      permissionMode: "auto"
    });
    const idx = args.indexOf("--permission-mode");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("acceptEdits");
  });

  it("maps permissionMode plan -> plan", () => {
    const args = buildArgs("hi", "", {
      binary: "claude",
      cwd: "/tmp",
      permissionMode: "plan"
    });
    expect(args).toContain("plan");
  });

  it("emits --allowedTools only in auto mode with bash patterns", () => {
    const noAllow = buildArgs("hi", "", {
      binary: "claude",
      cwd: "/tmp",
      permissionMode: "default",
      allowedBashPatterns: ["^npm test$"]
    });
    expect(noAllow).not.toContain("--allowedTools");

    const withAllow = buildArgs("hi", "", {
      binary: "claude",
      cwd: "/tmp",
      permissionMode: "auto",
      allowedBashPatterns: ["^npm test$"]
    });
    expect(withAllow).toContain("--allowedTools");
    expect(withAllow.some((a) => a.includes("Bash"))).toBe(true);
  });

  it("includes --resume when resume id present", () => {
    const args = buildArgs("hi", "", {
      binary: "claude",
      cwd: "/tmp",
      getResumeSessionId: () => "abc-123"
    });
    const idx = args.indexOf("--resume");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("abc-123");
  });
});

describe("claude-cli user/tool_result events", () => {
  it("emits tool_result delta from user event content", () => {
    const p = makeProcessor();
    const out = p({
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: "ok output",
            is_error: false
          }
        ]
      }
    });
    expect(out).toEqual([
      {
        type: "tool_result",
        toolUseId: "t1",
        resultContent: "ok output",
        resultIsError: false
      }
    ]);
  });

  it("concatenates tool_result with array content", () => {
    const p = makeProcessor();
    const out = p({
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "t2",
            content: [
              { type: "text", text: "line1" },
              { type: "text", text: "line2" }
            ],
            is_error: true
          }
        ]
      }
    });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("tool_result");
    expect(out[0].resultContent).toBe("line1\nline2");
    expect(out[0].resultIsError).toBe(true);
  });
});

describe("claude-cli stateful processor (stream_event partials)", () => {
  it("streams text_delta tokens from partial stream_events", () => {
    const p = makeProcessor();
    expect(
      p({
        type: "stream_event",
        event: { type: "content_block_start", content_block: { type: "text" } }
      })
    ).toEqual([]);
    expect(
      p({
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } }
      })
    ).toEqual([{ type: "text", text: "Hi" }]);
    expect(
      p({
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: " there" } }
      })
    ).toEqual([{ type: "text", text: " there" }]);
    expect(
      p({ type: "stream_event", event: { type: "content_block_stop" } })
    ).toEqual([]);
  });

  it("dedupes final assistant text when partials already streamed", () => {
    const p = makeProcessor();
    p({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "text" } } });
    p({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } } });
    p({ type: "stream_event", event: { type: "content_block_stop" } });
    const out = p({
      type: "assistant",
      message: { content: [{ type: "text", text: "Hello" }] }
    });
    expect(out).toEqual([]);
  });

  it("emits tool_use_start on content_block_start(tool_use)", () => {
    const p = makeProcessor();
    const out = p({
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", id: "t1", name: "Read" }
      }
    });
    expect(out).toEqual([
      { type: "tool_use_start", tool: { id: "t1", name: "Read" } }
    ]);
  });

  it("emits tool_use_input from input_json_delta + tool_use_end on content_block_stop", () => {
    const p = makeProcessor();
    p({
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", id: "t2", name: "Bash" }
      }
    });
    const partial = p({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: '{"command":"ls"}' }
      }
    });
    expect(partial).toEqual([
      { type: "tool_use_input", partialInput: '{"command":"ls"}' }
    ]);
    const end = p({
      type: "stream_event",
      event: { type: "content_block_stop" }
    });
    expect(end).toEqual([{ type: "tool_use_end" }]);
  });

  it("dedupes assistant tool_use when already started via partial", () => {
    const p = makeProcessor();
    p({
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", id: "t3", name: "Bash" }
      }
    });
    p({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: '{"command":"pwd"}' }
      }
    });
    p({ type: "stream_event", event: { type: "content_block_stop" } });
    const out = p({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", id: "t3", name: "Bash", input: { command: "pwd" } }
        ]
      }
    });
    expect(out).toEqual([]);
  });
});
