import { Icon } from "../../design/icons";
import { renderMarkdown } from "./markdown";

interface AssistantMessageProps {
  text: string;
  streaming?: boolean;
}

export function AssistantMessage({ text, streaming }: AssistantMessageProps) {
  return (
    <div className={`msg msg-assistant${streaming ? " streaming" : ""}`}>
      <div className="msg-avatar">
        <Icon name="sparkle" size={13} />
      </div>
      <div className="msg-body md">
        {renderMarkdown(text)}
        {streaming && <span className="caret" aria-hidden />}
      </div>
    </div>
  );
}
