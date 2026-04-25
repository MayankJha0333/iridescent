// ─────────────────────────────────────────────────────────────
// RichEditor — contenteditable composer with rich code blocks.
//
// The editor's DOM is the source of truth after mount. Plain text
// flows naturally; Cmd+L (and any caller using `pendingInsert`)
// inserts a styled, atomic code block at the current cursor with
// an editable code body. Markdown syntax markers (** ` ```) never
// appear to the user — code blocks are real DOM elements.
//
// On submit (or via the `serialize()` imperative API), the DOM is
// flattened back to a markdown string so the rest of the app can
// continue treating prompts as text.
// ─────────────────────────────────────────────────────────────

import {
  KeyboardEvent,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState
} from "react";

export interface CodeInsert {
  file: string;
  language: string;
  startLine: number;
  endLine: number;
  text: string;
}

export interface RichEditorHandle {
  focus(): void;
  clear(): void;
  serialize(): string;
}

export interface RichEditorProps {
  /** Initial value (markdown). Read once on mount. */
  initialText?: string;
  /** One-shot insert payload. Cleared via `onInserted` after splicing. */
  pendingInsert: CodeInsert | null;
  onInserted: () => void;
  /** Fires on every input change with the current serialized markdown. */
  onChange: (text: string) => void;
  /** Fires on Enter (without Shift) outside a code body. */
  onSubmit: () => void;
  busy: boolean;
  placeholder?: string;
}

const BADGE_CLASS = "re-badge";

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(
  function RichEditor(
    {
      initialText = "",
      pendingInsert,
      onInserted,
      onChange,
      onSubmit,
      busy,
      placeholder = "Ask, edit, or plan anything. Type @ to mention a file. ⌘L to insert selection."
    },
    forwardedRef
  ) {
    const ref = useRef<HTMLDivElement>(null);
    const [isEmpty, setIsEmpty] = useState(initialText.trim().length === 0);

    // Mount: render the initial markdown (parsing fenced blocks back into rich
    // code blocks so a reload preserves what the user already had).
    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      el.innerHTML = "";
      if (initialText) {
        renderInitial(el, initialText);
        setIsEmpty(serialize(el).trim().length === 0);
      }
      // intentionally only on mount
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Cmd+L → splice a code block at the caret.
    useEffect(() => {
      if (!pendingInsert || !ref.current) return;
      ref.current.focus();
      insertCodeBlockAtSelection(ref.current, pendingInsert);
      const text = serialize(ref.current);
      setIsEmpty(text.trim().length === 0);
      onChange(text);
      onInserted();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingInsert]);

    useImperativeHandle(forwardedRef, () => ({
      focus: () => {
        if (ref.current) placeCaretAtEnd(ref.current);
      },
      clear: () => {
        if (!ref.current) return;
        ref.current.innerHTML = "";
        setIsEmpty(true);
        onChange("");
      },
      serialize: () => (ref.current ? serialize(ref.current) : "")
    }));

    const handleInput = () => {
      if (!ref.current) return;
      const text = serialize(ref.current);
      setIsEmpty(text.trim().length === 0);
      onChange(text);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.nativeEvent.isComposing) return;

      if (e.key === "Enter" && !e.shiftKey) {
        // Newline inside a code body; submit otherwise.
        if (cursorInsideCodeBody()) return;
        e.preventDefault();
        onSubmit();
        return;
      }

      if (e.key === "Backspace") {
        const handled = handleBackspaceAtBoundary(ref.current);
        if (handled) {
          e.preventDefault();
          // Manually trigger change since we mutated DOM outside React.
          if (ref.current) {
            const text = serialize(ref.current);
            setIsEmpty(text.trim().length === 0);
            onChange(text);
          }
        }
      }
    };

    return (
      <div className="reditor-wrap">
        {isEmpty && <div className="reditor-placeholder">{placeholder}</div>}
        <div
          ref={ref}
          className="reditor"
          contentEditable={!busy}
          suppressContentEditableWarning
          spellCheck={false}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          role="textbox"
          aria-multiline="true"
          aria-label="Message Iridescent"
        />
      </div>
    );
  }
);

// ── DOM construction ────────────────────────────────────────

/**
 * Build a compact, atomic inline badge that represents a captured code
 * selection. The full code text and language ride along on data attributes
 * so they survive copy/paste within the editor and are available at
 * serialize time. The badge itself is contenteditable=false so backspace
 * removes it as a single unit.
 */
function makeCodeBadge(
  fileLabel: string,
  language: string,
  text: string
): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = BADGE_CLASS;
  badge.setAttribute("contenteditable", "false");
  badge.dataset.lang = language || "text";
  badge.dataset.code = text;
  badge.title = `${fileLabel}\n\n${truncate(text, 400)}`;

  const icon = document.createElement("span");
  icon.className = "re-badge-icon";
  icon.textContent = "</>";
  badge.appendChild(icon);

  const label = document.createElement("span");
  label.className = "re-badge-label";
  label.textContent = fileLabel || "code";
  badge.appendChild(label);

  return badge;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function insertCodeBlockAtSelection(container: HTMLElement, ins: CodeInsert) {
  const range =
    ins.startLine === ins.endLine
      ? `${ins.startLine}`
      : `${ins.startLine}–${ins.endLine}`;
  const badge = makeCodeBadge(`${ins.file}:${range}`, ins.language, ins.text);

  const sel = window.getSelection();
  let r: Range;
  if (
    sel &&
    sel.rangeCount > 0 &&
    container.contains(sel.anchorNode as Node | null)
  ) {
    r = sel.getRangeAt(0);
    r.deleteContents();
  } else {
    r = document.createRange();
    r.selectNodeContents(container);
    r.collapse(false);
  }

  // Pad with a single space on either side so the caret can land outside
  // the badge naturally — otherwise some browsers trap the caret against
  // the atomic element.
  const trailingSpace = document.createTextNode(" ");
  r.insertNode(trailingSpace);
  r.setStartBefore(trailingSpace);
  r.insertNode(badge);
  r.setStartAfter(trailingSpace);
  r.collapse(true);

  sel?.removeAllRanges();
  sel?.addRange(r);
}

// ── Serialization ───────────────────────────────────────────

/**
 * Walk the editor DOM and produce a markdown string. Inline badges expand
 * into a fenced code block on their own lines so the model receives a
 * clean prompt; visible plain text passes through as-is.
 */
function serialize(container: HTMLElement): string {
  const out: string[] = [];

  function emitNewlineIfNeeded() {
    const last = out.length > 0 ? out[out.length - 1] : "";
    if (last && !last.endsWith("\n")) out.push("\n");
  }

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? "").replace(/​/g, "");
      if (t) out.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    if (el.classList.contains(BADGE_CLASS)) {
      const label = el.querySelector(".re-badge-label")?.textContent ?? "";
      const lang = el.dataset.lang ?? "";
      const text = el.dataset.code ?? "";
      emitNewlineIfNeeded();
      if (label) out.push(`**${label}**\n`);
      out.push("```" + lang + "\n");
      out.push(text.replace(/\n+$/, ""));
      out.push("\n```\n");
      return;
    }

    if (el.tagName === "BR") {
      out.push("\n");
      return;
    }

    if (el.tagName === "DIV" || el.tagName === "P") {
      emitNewlineIfNeeded();
      for (const child of Array.from(el.childNodes)) walk(child);
      emitNewlineIfNeeded();
      return;
    }

    for (const child of Array.from(el.childNodes)) walk(child);
  }

  for (const child of Array.from(container.childNodes)) walk(child);

  return out
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Initial render (markdown → rich DOM) ───────────────────

function renderInitial(container: HTMLElement, text: string) {
  const lines = text.split("\n");
  let i = 0;

  const flushTextBuffer = (buf: string[]) => {
    if (buf.length === 0) return;
    const joined = buf.join("\n");
    const frag = document.createDocumentFragment();
    const parts = joined.split("\n");
    parts.forEach((p, idx) => {
      if (idx > 0) frag.appendChild(document.createElement("br"));
      if (p.length > 0) frag.appendChild(document.createTextNode(p));
    });
    container.appendChild(frag);
  };

  let textBuf: string[] = [];

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence

      // Pull a trailing **label** off the text buffer if present.
      let label = "";
      while (textBuf.length > 0 && textBuf[textBuf.length - 1].trim() === "") {
        textBuf.pop();
      }
      if (textBuf.length > 0) {
        const last = textBuf[textBuf.length - 1];
        const match = last.match(/^\*\*([^*]+)\*\*\s*$/);
        if (match) {
          label = match[1];
          textBuf.pop();
        }
      }

      flushTextBuffer(textBuf);
      textBuf = [];
      const badge = makeCodeBadge(label, lang, codeLines.join("\n"));
      container.appendChild(badge);
      container.appendChild(document.createTextNode(" "));
      continue;
    }

    textBuf.push(line);
    i++;
  }

  flushTextBuffer(textBuf);
}

// ── Caret + selection helpers ──────────────────────────────

function placeCaretAtEnd(el: HTMLElement) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/**
 * The caret lives outside any code-badge by design — code badges are atomic
 * inline spans, not editable blocks. We therefore never need to suppress
 * Enter inside one. (Kept for API parity with previous implementation.)
 */
function cursorInsideCodeBody(): boolean {
  return false;
}

/**
 * If the caret is immediately after an atomic code badge, eat one Backspace
 * by removing that badge. Returns true if handled.
 */
function handleBackspaceAtBoundary(container: HTMLElement | null): boolean {
  if (!container) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;

  const node = range.startContainer;
  const offset = range.startOffset;

  // Walk back over an optional space/zero-width char then look for a badge.
  let prev: ChildNode | null = null;

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (offset > 0 && text.charAt(offset - 1) !== " ") return false;
    if (offset === 0) {
      prev = node.previousSibling as ChildNode | null;
    } else {
      // Caret sits one position into a text node whose first chars are spaces
      // we inserted as caret padding. If the only content before is whitespace,
      // jump to the previous sibling.
      if (text.slice(0, offset).trim().length > 0) return false;
      prev = node.previousSibling as ChildNode | null;
    }
  } else if (node === container) {
    prev = (container.childNodes[offset - 1] as ChildNode) ?? null;
  } else {
    return false;
  }

  if (
    prev &&
    prev.nodeType === Node.ELEMENT_NODE &&
    (prev as HTMLElement).classList.contains(BADGE_CLASS)
  ) {
    prev.remove();
    return true;
  }
  return false;
}
