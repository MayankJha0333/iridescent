import { Icon } from "../../design/icons";
import { renderMarkdown } from "./markdown";

interface AssistantMessageProps {
  text: string;
  streaming?: boolean;
  showAvatar?: boolean;
}

export function AssistantMessage({ text, streaming, showAvatar = true }: AssistantMessageProps) {
  return (
    <div className={`msg msg-assistant${streaming ? " streaming" : ""}`}>
      {showAvatar ? (
        <div className="msg-avatar">
          <Icon name="sparkle" size={13} />
        </div>
      ) : (
        <div className="msg-avatar msg-avatar-spacer" aria-hidden />
      )}
      <div className="msg-body md">
        {renderMarkdown(text)}
        {streaming && <span className="caret" aria-hidden />}
      </div>
    </div>
  );
}
