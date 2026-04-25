import { renderMarkdown } from "../markdown";

interface Props {
  text: string;
  streaming?: boolean;
}

export function AssistantMessage({ text, streaming }: Props) {
  return (
    <div className={`msg msg-assistant ${streaming ? "streaming" : ""}`}>
      <div className="msg-avatar">
        <span className="avatar-glyph">✦</span>
      </div>
      <div className="msg-body md">
        {renderMarkdown(text)}
        {streaming && <span className="caret" />}
      </div>
    </div>
  );
}
