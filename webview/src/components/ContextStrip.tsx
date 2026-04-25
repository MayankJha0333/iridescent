export interface EditorContext {
  file: string;
  language: string;
  selection: { startLine: number; endLine: number } | null;
}

interface Props {
  context: EditorContext | null;
}

export function ContextStrip({ context }: Props) {
  if (!context) return null;
  const fileName = context.file.split("/").pop() ?? context.file;
  return (
    <div className="ctx-strip">
      <span className="ctx-chip ctx-file" title={context.file}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="ctx-name">{fileName}</span>
        <span className="ctx-lang">{context.language}</span>
      </span>
      {context.selection && (
        <span className="ctx-chip ctx-sel">
          L{context.selection.startLine}
          {context.selection.endLine !== context.selection.startLine &&
            `–${context.selection.endLine}`}
        </span>
      )}
    </div>
  );
}
