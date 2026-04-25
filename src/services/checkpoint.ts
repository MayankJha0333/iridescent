import * as path from "node:path";
import * as fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(exec);
const MAX_PER_SESSION = 20;

interface FileSnapshot {
  relPath: string;
  existed: boolean;
  content?: Buffer;
}

interface Checkpoint {
  turnId: string;
  createdAt: number;
  files: FileSnapshot[];
}

export class CheckpointService {
  private checkpoints: Map<string, Checkpoint> = new Map();
  private order: string[] = [];

  constructor(private workspaceRoot: string, private sessionId: string) {}

  async captureBefore(turnId: string): Promise<void> {
    const paths = await this.listCandidatePaths();
    const files: FileSnapshot[] = [];
    for (const rel of paths) {
      const abs = path.join(this.workspaceRoot, rel);
      try {
        const content = await fs.readFile(abs);
        files.push({ relPath: rel, existed: true, content });
      } catch {
        files.push({ relPath: rel, existed: false });
      }
    }
    this.checkpoints.set(turnId, { turnId, createdAt: Date.now(), files });
    this.order.push(turnId);
    this.gc();
  }

  async restore(turnId: string): Promise<{ restored: number; deleted: number }> {
    const cp = this.checkpoints.get(turnId);
    if (!cp) return { restored: 0, deleted: 0 };
    let restored = 0;
    let deleted = 0;
    for (const f of cp.files) {
      const abs = path.join(this.workspaceRoot, f.relPath);
      if (f.existed && f.content) {
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, f.content);
        restored++;
      } else {
        try {
          await fs.unlink(abs);
          deleted++;
        } catch {
          // already absent
        }
      }
    }
    const idx = this.order.indexOf(turnId);
    if (idx !== -1) {
      const drop = this.order.slice(idx + 1);
      for (const d of drop) this.checkpoints.delete(d);
      this.order = this.order.slice(0, idx + 1);
    }
    return { restored, deleted };
  }

  /**
   * Snapshot additional files not known at captureBefore time (e.g. after a write happened,
   * we realize this file should be part of the previous checkpoint).
   */
  async addFileToLatest(relPath: string): Promise<void> {
    if (this.order.length === 0) return;
    const latest = this.checkpoints.get(this.order[this.order.length - 1]);
    if (!latest) return;
    if (latest.files.some((f) => f.relPath === relPath)) return;
    const abs = path.join(this.workspaceRoot, relPath);
    try {
      const content = await fs.readFile(abs);
      latest.files.push({ relPath, existed: true, content });
    } catch {
      latest.files.push({ relPath, existed: false });
    }
  }

  hasCheckpoint(turnId: string): boolean {
    return this.checkpoints.has(turnId);
  }

  list(): { turnId: string; createdAt: number; fileCount: number }[] {
    return this.order
      .map((id) => {
        const cp = this.checkpoints.get(id);
        return cp
          ? { turnId: cp.turnId, createdAt: cp.createdAt, fileCount: cp.files.length }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }

  clear() {
    this.checkpoints.clear();
    this.order = [];
  }

  private gc() {
    while (this.order.length > MAX_PER_SESSION) {
      const oldest = this.order.shift();
      if (oldest) this.checkpoints.delete(oldest);
    }
  }

  private async listCandidatePaths(): Promise<string[]> {
    try {
      const { stdout } = await pexec("git status --porcelain=v1 -uall", {
        cwd: this.workspaceRoot,
        timeout: 5000,
        maxBuffer: 2_000_000
      });
      const files = new Set<string>();
      for (const rawLine of stdout.split("\n")) {
        if (!rawLine) continue;
        // Porcelain v1 format: `XY path` where XY is 2 status chars + 1 space.
        // Lines may have leading space in XY (e.g. " M path"). Do not trim.
        const p = rawLine.slice(3).trim();
        if (p) files.add(p);
      }
      return [...files];
    } catch {
      return [];
    }
  }
}
