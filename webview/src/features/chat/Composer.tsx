// ─────────────────────────────────────────────────────────────
// Composer — chat input with mode picker, model picker (dynamic),
// skills picker, attachments bar, and inline @-mention popover.
// ─────────────────────────────────────────────────────────────

import { KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../design/icons";
import { Dropdown } from "../../design/primitives";
import {
  send,
  newId,
  Attachment,
  AuthMode,
  PermissionMode,
  ModelInfo,
  SkillInfo,
  FileSearchResult
} from "../../lib/rpc";
import { MODES, findMode } from "./constants";
import { MentionPopover } from "./MentionPopover";
import { AttachmentBar } from "./AttachmentBar";
import { SkillsPicker } from "./SkillsPicker";
import { ModelPicker } from "./ModelPicker";

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string, attachments: Attachment[]) => void;
  onCancel: () => void;
  busy: boolean;
  authMode: AuthMode | null;
  model: string;
  permissionMode: PermissionMode;
  models: ReadonlyArray<ModelInfo>;
  skills: ReadonlyArray<SkillInfo>;
  attachments: ReadonlyArray<Attachment>;
  onAddAttachment: (a: Attachment) => void;
  onRemoveAttachment: (id: string) => void;
  onClearAttachments: () => void;
  /** External signal (from Cmd+L etc.) to focus the textarea. */
  focusKey: number;
}

interface MentionState {
  active: boolean;
  /** Text after the `@` and before the cursor. */
  query: string;
  /** Index in `value` where the `@` sits. */
  start: number;
}

const NO_MENTION: MentionState = { active: false, query: "", start: -1 };

export function Composer({
  value,
  onChange,
  onSubmit,
  onCancel,
  busy,
  authMode,
  model,
  permissionMode,
  models,
  skills,
  attachments,
  onAddAttachment,
  onRemoveAttachment,
  onClearAttachments,
  focusKey
}: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const [mention, setMention] = useState<MentionState>(NO_MENTION);

  // Resize textarea to fit content.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [value]);

  // External focus signal (Cmd+L etc.).
  useEffect(() => {
    if (focusKey > 0) ref.current?.focus();
  }, [focusKey]);

  const detectMention = useCallback(
    (text: string, caret: number): MentionState => {
      // Walk backward from caret to find an `@` that begins a mention.
      // A mention is `@` immediately preceded by start-of-string or whitespace,
      // followed by zero or more non-whitespace chars up to the caret.
      let i = caret - 1;
      while (i >= 0 && !/\s/.test(text[i])) i--;
      const tokenStart = i + 1;
      if (text[tokenStart] !== "@") return NO_MENTION;
      const before = tokenStart === 0 ? " " : text[tokenStart - 1];
      if (!/\s/.test(before) && tokenStart !== 0) return NO_MENTION;
      const query = text.slice(tokenStart + 1, caret);
      // Stop the popover if the query already contains a slash that
      // looks like a fully-typed path (developer pasted one in).
      if (query.includes(" ")) return NO_MENTION;
      return { active: true, query, start: tokenStart };
    },
    []
  );

  const onInputChange = (text: string) => {
    onChange(text);
    const caret = ref.current?.selectionStart ?? text.length;
    setMention(detectMention(text, caret));
  };

  const onSelectionChange = () => {
    const el = ref.current;
    if (!el) return;
    setMention(detectMention(el.value, el.selectionStart));
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // The mention popover handles its own arrow/enter/escape via window
    // listener. Only fall through to send/newline behavior when closed.
    if (mention.active) return;
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const insertAtCursor = (token: string) => {
    const el = ref.current;
    if (!el) {
      onChange(value + (value.endsWith(" ") || value === "" ? token : " " + token));
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const insert = needsSpace ? " " + token : token;
    const next = before + insert + after;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = before.length + insert.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleMentionPick = useCallback(
    (result: FileSearchResult) => {
      const el = ref.current;
      if (!el || !mention.active) return;

      // Replace `@<query>` with `@<basename>` so the message remains readable.
      const basename = result.name || result.path.split("/").pop() || result.path;
      const before = value.slice(0, mention.start);
      const after = value.slice(el.selectionStart);
      const replacement = `@${basename}`;
      const next = before + replacement + (after.startsWith(" ") ? after : " " + after);
      onChange(next);
      const pos = (before + replacement + " ").length;

      // Add the file as an attachment (content fetched lazily by the host).
      const attId = newId();
      onAddAttachment({
        id: attId,
        kind: "file",
        label: basename,
        path: result.path
      });
      // Request file content so the chip can preview and the prompt can include it.
      send({ type: "readFileSnippet", id: attId, path: result.path });

      setMention(NO_MENTION);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    },
    [value, mention, onChange, onAddAttachment]
  );

  const handleSubmit = () => {
    if (busy) return;
    const text = value.trim();
    if (!text && attachments.length === 0) return;
    onSubmit(text, [...attachments]);
    onClearAttachments();
    setMention(NO_MENTION);
  };

  const canSend = !busy && (value.trim().length > 0 || attachments.length > 0);
  const mode = findMode(permissionMode);

  return (
    <div className={`cmp${focused ? " focused" : ""}${busy ? " busy" : ""}`}>
      <MentionPopover
        open={mention.active}
        query={mention.query}
        onPick={handleMentionPick}
        onClose={() => setMention(NO_MENTION)}
      />

      {/* Chips at the top of the input area, where the user is composing. */}
      <AttachmentBar attachments={attachments} onRemove={onRemoveAttachment} />

      <textarea
        ref={ref}
        placeholder="Ask, edit, or plan anything. Type @ to mention a file."
        value={value}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKey}
        onKeyUp={onSelectionChange}
        onClick={onSelectionChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={2}
        disabled={busy}
        spellCheck={false}
      />

      <div className="cmp-toolbar">
        {/* Mode picker — left */}
        <Dropdown<PermissionMode>
          options={MODES.map((m) => ({
            value: m.value,
            label: m.label,
            note: m.note,
            icon: m.icon
          }))}
          value={permissionMode}
          onSelect={(v) => send({ type: "setPermissionMode", mode: v })}
          align="left"
          placement="above"
          ariaLabel="Permission mode"
          triggerClassName="cmp-mode"
          trigger={() => (
            <>
              <Icon name={mode.icon} size={12} />
              <span>{mode.short}</span>
              <Icon name="chevronD" size={9} />
            </>
          )}
        />

        <SkillsPicker skills={skills} />

        <div className="cmp-divider" />

        <button
          type="button"
          className="cmp-tool"
          title="Mention a file (@)"
          aria-label="Mention a file"
          onClick={() => insertAtCursor("@")}
        >
          <Icon name="at" size={13} />
        </button>
        <button
          type="button"
          className="cmp-action"
          title="Insert editor selection (⌘L)"
          aria-label="Insert editor selection"
          onClick={() => send({ type: "captureSelection" })}
        >
          <Icon name="code" size={12} />
        </button>

        <div className="cmp-spacer" />

        {/* Model picker — right (built-in + custom + Add model) */}
        <ModelPicker
          models={models}
          value={model}
          onSelect={(v) => send({ type: "setModel", model: v })}
        />

        {busy ? (
          <button
            type="button"
            className="cmp-send stop"
            onClick={onCancel}
            title="Cancel"
            aria-label="Cancel"
          >
            <Icon name="stop" size={11} />
          </button>
        ) : (
          <button
            type="button"
            className="cmp-send"
            onClick={handleSubmit}
            disabled={!canSend}
            title="Send (↵)"
            aria-label="Send"
          >
            <Icon name="send" size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
