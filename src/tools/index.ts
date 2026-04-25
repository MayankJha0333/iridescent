import { ToolHandler } from "../core/types.js";
import { fsRead } from "./fs-read.js";
import { fsWrite } from "./fs-write.js";
import { bash } from "./bash.js";

export function defaultTools(): Record<string, ToolHandler> {
  return {
    fs_read: fsRead,
    fs_write: fsWrite,
    bash
  };
}
