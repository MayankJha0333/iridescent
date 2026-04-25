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

    if (/^#{1,6}\s/.test(line)) {
      const m = line.match(/^(#{1,6})\s+(.*)$/)!;
      const level = m[1].length;
      const Tag = `h${Math.min(level + 2, 6)}` as "h3" | "h4" | "h5" | "h6";
      out.push(<Tag key={key++} className="md-h">{inline(m[2], key)}</Tag>);
      i++;
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(<li key={`li-${key++}`}>{inline(lines[i].replace(/^[-*]\s/, ""), key)}</li>);
        i++;
      }
      out.push(<ul key={key++} className="md-ul">{items}</ul>);
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={`oli-${key++}`}>{inline(lines[i].replace(/^\d+\.\s/, ""), key)}</li>);
        i++;
      }
      out.push(<ol key={key++} className="md-ol">{items}</ol>);
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
    out.push(<p key={key++} className="md-p">{inline(para.join(" "), key)}</p>);
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
        <button className="md-code-copy" onClick={copy}>
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
      <pre className="md-code" data-lang={lang}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function inline(text: string, keyBase: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let localKey = 0;

  const patterns: Array<{ re: RegExp; wrap: (m: RegExpExecArray) => ReactNode }> = [
    { re: /`([^`]+)`/, wrap: (m) => <code className="md-ic" key={`${keyBase}-${localKey++}`}>{m[1]}</code> },
    { re: /\*\*([^*]+)\*\*/, wrap: (m) => <strong key={`${keyBase}-${localKey++}`}>{m[1]}</strong> },
    { re: /\*([^*]+)\*/, wrap: (m) => <em key={`${keyBase}-${localKey++}`}>{m[1]}</em> },
    { re: /_([^_]+)_/, wrap: (m) => <em key={`${keyBase}-${localKey++}`}>{m[1]}</em> },
    {
      re: /\[([^\]]+)\]\(([^)]+)\)/,
      wrap: (m) => (
        <a key={`${keyBase}-${localKey++}`} href={m[2]} target="_blank" rel="noreferrer">
          {m[1]}
        </a>
      )
    }
  ];

  while (rest.length > 0) {
    let earliest: { idx: number; match: RegExpExecArray; wrap: (m: RegExpExecArray) => ReactNode } | null = null;
    for (const p of patterns) {
      const m = p.re.exec(rest);
      if (m && (earliest === null || m.index < earliest.idx)) {
        earliest = { idx: m.index, match: m, wrap: p.wrap };
      }
    }
    if (!earliest) {
      nodes.push(rest);
      break;
    }
    if (earliest.idx > 0) nodes.push(rest.slice(0, earliest.idx));
    nodes.push(earliest.wrap(earliest.match));
    rest = rest.slice(earliest.idx + earliest.match[0].length);
  }
  return nodes;
}
