// ─────────────────────────────────────────────────────────────
// Lightweight markdown renderer. Supports:
//   - fenced code blocks ``` with language + copy button
//   - headings (#–######)
//   - unordered (-, *) and ordered (1.) lists
//   - inline code, bold, italic, links
// Intentionally small — no remark/HTML parsing in the webview.
// ─────────────────────────────────────────────────────────────

import { ReactNode, useState } from "react";

export function renderMarkdown(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = src.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      i++;
      out.push(<CodeBlock key={key++} lang={lang} code={code.join("\n")} />);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 2, 6);
      const Tag = `h${level}` as "h3" | "h4" | "h5" | "h6";
      out.push(
        <Tag key={key++} className="md-h">
          {inline(heading[2], key)}
        </Tag>
      );
      i++;
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(
          <li key={`li-${key++}`}>{inline(lines[i].replace(/^[-*]\s/, ""), key)}</li>
        );
        i++;
      }
      out.push(
        <ul key={key++} className="md-ul">
          {items}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(
          <li key={`oli-${key++}`}>{inline(lines[i].replace(/^\d+\.\s/, ""), key)}</li>
        );
        i++;
      }
      out.push(
        <ol key={key++} className="md-ol">
          {items}
        </ol>
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^[-*]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(
      <p key={key++} className="md-p">
        {inline(para.join(" "), key)}
      </p>
    );
  }

  return out;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div className="md-code-wrap">
      <div className="md-code-bar">
        <span className="md-code-lang">{lang || "text"}</span>
        <button type="button" className="md-code-copy" onClick={copy}>
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
      <pre className="md-code" data-lang={lang}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

interface InlinePattern {
  re: RegExp;
  wrap: (m: RegExpExecArray, k: string) => ReactNode;
}

const PATTERNS: ReadonlyArray<InlinePattern> = [
  { re: /`([^`]+)`/, wrap: (m, k) => <code className="md-ic" key={k}>{m[1]}</code> },
  { re: /\*\*([^*]+)\*\*/, wrap: (m, k) => <strong key={k}>{m[1]}</strong> },
  { re: /\*([^*]+)\*/, wrap: (m, k) => <em key={k}>{m[1]}</em> },
  { re: /_([^_]+)_/, wrap: (m, k) => <em key={k}>{m[1]}</em> },
  {
    re: /\[([^\]]+)\]\(([^)]+)\)/,
    wrap: (m, k) => (
      <a key={k} href={m[2]} target="_blank" rel="noreferrer">
        {m[1]}
      </a>
    )
  }
];

function inline(text: string, keyBase: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let local = 0;

  while (rest.length > 0) {
    let earliest: { idx: number; match: RegExpExecArray; pat: InlinePattern } | null = null;
    for (const p of PATTERNS) {
      const m = p.re.exec(rest);
      if (m && (earliest === null || m.index < earliest.idx)) {
        earliest = { idx: m.index, match: m, pat: p };
      }
    }
    if (!earliest) {
      nodes.push(rest);
      break;
    }
    if (earliest.idx > 0) nodes.push(rest.slice(0, earliest.idx));
    nodes.push(earliest.pat.wrap(earliest.match, `${keyBase}-${local++}`));
    rest = rest.slice(earliest.idx + earliest.match[0].length);
  }
  return nodes;
}
