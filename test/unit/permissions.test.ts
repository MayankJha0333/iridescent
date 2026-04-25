import { describe, it, expect, vi } from "vitest";
import {
  createGate,
  check,
  isDestructiveBash,
  isProtectedPath
} from "../../src/core/permissions.js";

describe("isProtectedPath", () => {
  it("blocks git, env, ssh, shell rc", () => {
    expect(isProtectedPath(".git/config")).toBe(true);
    expect(isProtectedPath("a/.git/HEAD")).toBe(true);
    expect(isProtectedPath(".env")).toBe(true);
    expect(isProtectedPath(".env.production")).toBe(true);
    expect(isProtectedPath("home/.ssh/id_rsa")).toBe(true);
    expect(isProtectedPath(".bashrc")).toBe(true);
    expect(isProtectedPath("src/app.ts")).toBe(false);
  });
});

describe("isDestructiveBash", () => {
  it("detects common destructive commands", () => {
    expect(isDestructiveBash("rm -rf /")).toBe(true);
    expect(isDestructiveBash("git push --force origin main")).toBe(true);
    expect(isDestructiveBash("git push -f")).toBe(true);
    expect(isDestructiveBash("DROP TABLE users")).toBe(true);
    expect(isDestructiveBash("ls -la")).toBe(false);
  });
});

describe("permission gate", () => {
  const req = (tool: string, destructive = false) => ({
    tool,
    input: {},
    summary: tool,
    destructive
  });

  it("bypass allows non-destructive, still confirms destructive", async () => {
    const gate = createGate("bypass", []);
    const approve = vi.fn().mockResolvedValue("once");
    expect(await check(gate, req("bash"), approve)).toBe(true);
    expect(approve).not.toHaveBeenCalled();
    expect(await check(gate, req("bash", true), approve)).toBe(true);
    expect(approve).toHaveBeenCalledOnce();
  });

  it("plan mode denies all tool use", async () => {
    const gate = createGate("plan", []);
    const approve = vi.fn().mockResolvedValue("once");
    expect(await check(gate, req("fs_write"), approve)).toBe(false);
  });

  it("auto mode allows fs_read without prompt", async () => {
    const gate = createGate("auto", []);
    const approve = vi.fn().mockResolvedValue("deny");
    expect(await check(gate, req("fs_read"), approve)).toBe(true);
    expect(approve).not.toHaveBeenCalled();
  });

  it("auto mode allowlists bash patterns", async () => {
    const gate = createGate("auto", ["^npm test$"]);
    const approve = vi.fn().mockResolvedValue("deny");
    const ok = await check(
      gate,
      { tool: "bash", input: { command: "npm test" }, summary: "x", destructive: false },
      approve
    );
    expect(ok).toBe(true);
    expect(approve).not.toHaveBeenCalled();
  });

  it("default mode prompts and caches 'always'", async () => {
    const gate = createGate("default", []);
    const approve = vi.fn().mockResolvedValueOnce("always").mockResolvedValueOnce("deny");
    expect(await check(gate, req("fs_write"), approve)).toBe(true);
    expect(await check(gate, req("fs_write"), approve)).toBe(true);
    expect(approve).toHaveBeenCalledOnce();
  });
});
