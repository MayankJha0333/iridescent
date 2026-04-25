import { send } from "../../lib/rpc";

interface ErrorBannerProps {
  text: string;
  onDismiss: () => void;
}

export function ErrorBanner({ text, onDismiss }: ErrorBannerProps) {
  const isRateLimit = /429|rate.?limit/i.test(text);
  const isAuth = /401|403|auth rejected/i.test(text);
  const title = isRateLimit ? "Rate limited" : isAuth ? "Authentication failed" : "Error";
  const icon = isRateLimit ? "⏱" : isAuth ? "🔒" : "⚠";

  return (
    <div className="error-banner" role="alert">
      <div className="error-head">
        <span className="error-icon" aria-hidden>
          {icon}
        </span>
        <span className="error-title">{title}</span>
        <button
          type="button"
          className="error-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="error-body">{text}</div>
      {(isAuth || isRateLimit) && (
        <div className="error-actions">
          <button type="button" onClick={() => send({ type: "authReset" })}>
            {isRateLimit ? "Switch auth" : "Logout & Reconnect"}
          </button>
        </div>
      )}
    </div>
  );
}
