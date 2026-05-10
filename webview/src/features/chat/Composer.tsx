// ─────────────────────────────────────────────────────────────
// Composer — chat input. Uses a contenteditable RichEditor for
// inline rich content (no markdown markers visible to the user;
// code from Cmd+L lands as a styled, editable block). The mode
// picker, skills picker, and model picker live in the toolbar
// below.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../design/icons";
import {
  Dropdown,
  RichEditor,
  type CodeInsert,
  type RichEditorHandle
} from "../../design/primitives";
import {
  send,
  AuthMode,
  PermissionMode,
  ModelInfo,
  SkillInfo,
  FileSearchResult
} from "../../lib/rpc";
import { MODES, findMode } from "./constants";
import { MentionPopover } from "./MentionPopover";
import { SkillsPicker } from "./SkillsPicker";
import { ModelPicker } from "./ModelPicker";

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  busy: boolean;
  authMode: AuthMode | null;
  model: string;
  permissionMode: PermissionMode;
  models: ReadonlyArray<ModelInfo>;
  skills: ReadonlyArray<SkillInfo>;
  /** External signal (from Cmd+L etc.) to focus the editor. */
  focusKey: number;
  /** When set, splice this code block at the caret then call onInserted. */
  pendingInsert: CodeInsert | null;
  onInserted: () => void;
  /** Compact in-message edit mode: hides the toolbar, swaps in a Cancel/Send footer. */
  inline?: boolean;
  /** Inline mode only — called when the user discards the edit. */
  onDiscard?: () => void;
}

interface MentionState {
  active: boolean;
  query: string;
}

const NO_MENTION: MentionState = { active: false, query: "" };

export function Composer({
  value,
  onChange,
  onSubmit,
  onCancel,
  busy,
  model,
  permissionMode,
  models,
  skills,
  focusKey,
  pendingInsert,
  onInserted,
  inline = false,
  onDiscard
}: ComposerProps) {
  const editorRef = useRef<RichEditorHandle | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [mention, setMention] = useState<MentionState>(NO_MENTION);
  // The editor is mounted once with its persisted text; React shouldn't keep
  // re-pushing `value` into it (it owns its DOM after mount). We freeze the
  // initial value to avoid remount churn.
  const initialTextRef = useRef(value);

  // Latest-onDiscard ref so the inline-mode listeners below don't have
  // `onDiscard` as a useEffect dep — `onDiscard` is a fresh closure on
  // every parent (ChatScreen) render, and re-running the effect would
  // tear down/re-register listeners and re-focus the editor mid-keystroke,
  // racing the EditConfirmModal mount.
  const discardRef = useRef(onDiscard);
  useEffect(() => {
    discardRef.current = onDiscard;
  }, [onDiscard]);

  useEffect(() => {
    if (focusKey > 0) editorRef.current?.focus();
  }, [focusKey]);

  // Inline edit mode: focus once on mount, then keep listeners alive for
  // the lifetime of the inline editor.
  //   • Esc          → discard
  //   • click outside → discard, EXCEPT clicks landing inside a modal/dialog
  //                     (the EditConfirmModal that opens on submit), so the
  //                     editor stays mounted while the user picks Revert /
  //                     Don't revert / Cancel on the modal.
  useEffect(() => {
    if (!inline) return;
    editorRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        discardRef.current?.();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const wrap = wrapperRef.current;
      if (!wrap) return;
      const target = e.target as Element | null;
      if (!target) return;
      if (wrap.contains(target)) return;
      if (target.closest('[role="dialog"]')) return;
      discardRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [inline]);

  // Detect a mention query by inspecting the current selection. The popover
  // tracks the trailing `@<query>` chunk just before the caret in plain text.
  const refreshMention = useCallback(() => {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      setMention(NO_MENTION);
      return;
    }
    const text = node.textContent ?? "";
    const offset = sel?.anchorOffset ?? 0;
    let i = offset - 1;
    while (i >= 0 && !/\s/.test(text[i])) i--;
    const tokenStart = i + 1;
    if (text[tokenStart] !== "@") {
      setMention(NO_MENTION);
      return;
    }
    const before = tokenStart === 0 ? " " : text[tokenStart - 1];
    if (!/\s/.test(before) && tokenStart !== 0) {
      setMention(NO_MENTION);
      return;
    }
    const query = text.slice(tokenStart + 1, offset);
    if (query.includes(" ")) {
      setMention(NO_MENTION);
      return;
    }
    setMention({ active: true, query });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshMention);
    return () => document.removeEventListener("selectionchange", refreshMention);
  }, [refreshMention]);

  const handleEditorChange = (text: string) => {
    onChange(text);
    refreshMention();
  };

  const handleSubmit = () => {
    // In inline (edit) mode submit is allowed even while a turn is streaming —
    // the server's editAt handler cancels the in-flight stream and rewinds
    // before re-prompting. Blocking on `busy` here would silently swallow
    // the Enter and the EditConfirmModal would never open.
    if (busy && !inline) return;
    const text = (editorRef.current?.serialize() ?? "").trim();
    if (!text) return;
    onSubmit(text);
    // Don't clear in inline mode — the parent shows a confirmation modal,
    // and if the user cancels we want the text preserved so they can keep
    // editing without retyping.
    if (!inline) editorRef.current?.clear();
    setMention(NO_MENTION);
  };

  const handleMentionPick = useCallback((result: FileSearchResult) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const text = node.textContent ?? "";
    const offset = range.startOffset;
    let i = offset - 1;
    while (i >= 0 && !/\s/.test(text[i])) i--;
    const tokenStart = i + 1;
    if (text[tokenStart] !== "@") return;

    const basename = result.name || result.path.split("/").pop() || result.path;
    const replacement = `@${basename} `;
    const before = text.slice(0, tokenStart);
    const after = text.slice(offset);
    const newText = before + replacement + after;
    node.textContent = newText;

    // Place caret right after the inserted reference.
    const caretPos = (before + replacement).length;
    const r = document.createRange();
    r.setStart(node, caretPos);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);

    setMention(NO_MENTION);
    // Notify parent so persisted value updates.
    onChange(editorRef.current?.serialize() ?? "");
  }, [onChange]);

  const insertTokenAtCursor = (token: string) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      editorRef.current?.focus();
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(token));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    onChange(editorRef.current?.serialize() ?? "");
  };

  const canSend = !busy && value.trim().length > 0;
  const mode = findMode(permissionMode);

  const wrapperCls = [
    "relative bg-s2 border rounded-xl overflow-visible transition-[border-color,box-shadow] duration-150",
    inline ? "mx-0 my-0 border-accent-mid shadow-[0_0_0_1px_var(--accent-soft)]" : "mx-3 mt-2 mb-3 border-b2",
    !inline && focused ? "border-accent shadow-[0_0_0_3px_var(--accent-soft)]" : "",
    busy ? "opacity-90 [&_.dropdown]:opacity-100 [&_.mention-popover]:opacity-100" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={wrapperRef} className={wrapperCls}>
      <MentionPopover
        open={mention.active}
        query={mention.query}
        onPick={handleMentionPick}
        onClose={() => setMention(NO_MENTION)}
      />

      <div
        className="relative w-full"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <RichEditor
          ref={editorRef}
          initialText={initialTextRef.current}
          pendingInsert={pendingInsert}
          onInserted={onInserted}
          onChange={handleEditorChange}
          onSubmit={handleSubmit}
          busy={busy}
        />
      </div>

      {inline ? null : (
        <div className="flex items-center gap-1 px-2 py-1.5 border-t border-b1">
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
            triggerClassName={MODE_BTN}
            trigger={() => (
              <>
                <Icon name={mode.icon} size={12} />
                <span>{mode.short}</span>
                <Icon name="chevronD" size={9} />
              </>
            )}
          />

          <SkillsPicker skills={skills} />

          <div className="w-px h-4 bg-b1 mx-1" />

          <button
            type="button"
            className={TOOL_BTN}
            title="Mention a file (@)"
            aria-label="Mention a file"
            onClick={() => insertTokenAtCursor("@")}
          >
            <Icon name="at" size={13} />
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-transparent border-0 text-t3 text-[11px] font-semibold font-[inherit] cursor-pointer transition-colors hover:bg-s3 hover:text-t1"
            title="Insert editor selection (⌘L)"
            aria-label="Insert editor selection"
            onClick={() => send({ type: "captureSelection" })}
          >
            <Icon name="code" size={12} />
            <span>Selection</span>
            <kbd className="font-mono text-[10.5px] font-semibold text-t3 leading-none rounded-[4px] bg-s3 border border-b2 px-[5px] py-px">
              ⌘L
            </kbd>
          </button>

          <div className="flex-1" />

          <ModelPicker
            models={models}
            value={model}
            onSelect={(v) => send({ type: "setModel", model: v })}
          />

          {busy ? (
            <button
              type="button"
              className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-transparent text-err border border-err cursor-pointer transition-colors hover:bg-err-soft"
              onClick={onCancel}
              title="Cancel"
              aria-label="Cancel"
            >
              <Icon name="stop" size={11} />
            </button>
          ) : (
            <button
              type="button"
              className={SEND_BTN}
              onClick={handleSubmit}
              disabled={!canSend}
              title="Send (↵)"
              aria-label="Send"
            >
              <Icon name="send" size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const MODE_BTN =
  "inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-transparent border border-b1 text-t2 text-[11px] font-semibold font-[inherit] cursor-pointer transition-colors hover:bg-s3 hover:text-t1 hover:border-b3";

const TOOL_BTN =
  "inline-flex items-center justify-center w-7 h-7 rounded-md bg-transparent border-0 text-t3 cursor-pointer transition-colors hover:bg-s3 hover:text-t1 disabled:opacity-35 disabled:cursor-not-allowed";

const SEND_BTN =
  "inline-flex items-center justify-center w-8 h-8 rounded-md bg-accent text-white border-0 cursor-pointer transition-all duration-150 shadow-[0_2px_10px_var(--accent-shadow)] hover:not-[:disabled]:bg-accent-deep hover:not-[:disabled]:-translate-y-px disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none";
