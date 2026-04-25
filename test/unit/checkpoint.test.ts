import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { CheckpointService } from "../../src/services/checkpoint.js";

const pexec = promisify(exec);

describe("CheckpointService", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "iri-cp-"));
    await pexec("git init", { cwd: tmp });
    await pexec('git config user.email "t@t.com"', { cwd: tmp });
    await pexec('git config user.name "t"', { cwd: tmp });
    await fs.writeFile(path.join(tmp, "a.txt"), "original-a");
    await fs.writeFile(path.join(tmp, "b.txt"), "original-b");
    await pexec("git add -A && git commit -m init", { cwd: tmp });
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("captures and restores modified files", async () => {
    const svc = new CheckpointService(tmp, "sess-1");
    await fs.writeFile(path.join(tmp, "a.txt"), "changed-a");
    await svc.captureBefore("turn-1");

    await fs.writeFile(path.join(tmp, "a.txt"), "changed-again");
    const { restored } = await svc.restore("turn-1");
    expect(restored).toBeGreaterThanOrEqual(1);
    const after = await fs.readFile(path.join(tmp, "a.txt"), "utf8");
    expect(after).toBe("changed-a");
  });

  it("captures untracked files and restores their content", async () => {
    const svc = new CheckpointService(tmp, "sess-2");
    await fs.writeFile(path.join(tmp, "new.txt"), "exists-before");
    await svc.captureBefore("turn-1");

    await fs.writeFile(path.join(tmp, "new.txt"), "modified-after");
    const { restored } = await svc.restore("turn-1");
    expect(restored).toBeGreaterThanOrEqual(1);
    const after = await fs.readFile(path.join(tmp, "new.txt"), "utf8");
    expect(after).toBe("exists-before");
  });

  it("addFileToLatest deletes files that did not exist at capture time", async () => {
    const svc = new CheckpointService(tmp, "sess-2b");
    await svc.captureBefore("turn-1");
    // Agent later creates a file. Simulate: mark it in the checkpoint BEFORE it exists.
    await svc.addFileToLatest("brand-new.txt");
    // Now agent actually writes it.
    await fs.writeFile(path.join(tmp, "brand-new.txt"), "agent-created");

    const { deleted } = await svc.restore("turn-1");
    expect(deleted).toBeGreaterThanOrEqual(1);
    await expect(fs.access(path.join(tmp, "brand-new.txt"))).rejects.toThrow();
  });

  it("drops forward history on rewind", async () => {
    const svc = new CheckpointService(tmp, "sess-3");
    await fs.writeFile(path.join(tmp, "a.txt"), "v1");
    await svc.captureBefore("t1");
    await fs.writeFile(path.join(tmp, "a.txt"), "v2");
    await svc.captureBefore("t2");

    expect(svc.hasCheckpoint("t1")).toBe(true);
    expect(svc.hasCheckpoint("t2")).toBe(true);

    await svc.restore("t1");
    expect(svc.hasCheckpoint("t1")).toBe(true);
    expect(svc.hasCheckpoint("t2")).toBe(false);
  });

  it("gc keeps last 20 per session", async () => {
    const svc = new CheckpointService(tmp, "sess-4");
    for (let i = 0; i < 25; i++) {
      await svc.captureBefore(`t-${i}`);
    }
    expect(svc.list().length).toBe(20);
    expect(svc.hasCheckpoint("t-0")).toBe(false);
    expect(svc.hasCheckpoint("t-24")).toBe(true);
  });
});
