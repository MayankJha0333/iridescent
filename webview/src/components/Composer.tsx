import { KeyboardEvent, useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
  mode: string | null;
}

export function Composer({ value, onChange, onSubmit, onCancel, busy, mode }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [value]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSubmit();
    }
  };

  const canSend = value.trim().length > 0 && !busy;

  return (
    <div className={`cmp ${focused ? "focused" : ""} ${busy ? "busy" : ""}`}>
      <textarea
        ref={ref}
        placeholder={
          mode === "subscription"
            ? "Message Iridescent — using your Claude subscription…"
            : "Message Iridescent…"
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={1}
        disabled={busy}
        spellCheck={false}
      />

      <div className="cmp-toolbar">
        <div className="cmp-tools">
          <button
            type="button"
            className="cmp-tool"
            title="Attach context (coming soon)"
            disabled
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <button
            type="button"
            className="cmp-tool"
            title="Reference @file"
            onClick={() => {
              onChange(value + (value.endsWith(" ") || value === "" ? "@" : " @"));
              ref.current?.focus();
            }}
          >
            <span className="cmp-at">@</span>
          </button>
          <button
            type="button"
            className="cmp-tool"
            title="Slash command"
            onClick={() => {
              onChange(value + (value.endsWith(" ") || value === "" ? "/" : " /"));
              ref.current?.focus();
            }}
          >
            <span className="cmp-slash">/</span>
          </button>
        </div>

        <div className="cmp-right">
          <span className="cmp-hint">
            <kbd>↵</kbd> send · <kbd>⇧↵</kbd> newline
          </span>
          {busy ? (
            <button className="cmp-send stop" onClick={onCancel} title="Cancel">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              className="cmp-send"
              onClick={onSubmit}
              disabled={!canSend}
              title="Send (↵)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
