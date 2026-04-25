import { Icon } from "../../design/icons";
import type { EditorContext } from "../../lib/rpc";

export function ContextStrip({ context }: { context: EditorContext | null }) {
  if (!context) return null;
  const fileName = context.file.split("/").pop() ?? context.file;
  const sel = context.selection;
  return (
    <div className="ctx-strip">
      <span className="ctx-chip ctx-file" title={context.file}>
        <Icon name="file" size={12} />
        <span className="ctx-name">{fileName}</span>
        <span className="ctx-lang">{context.language}</span>
      </span>
      {sel && (
        <span className="ctx-chip ctx-sel">
          L{sel.startLine}
          {sel.endLine !== sel.startLine && `–${sel.endLine}`}
        </span>
      )}
    </div>
  );
}
