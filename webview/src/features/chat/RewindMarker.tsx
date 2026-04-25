import { Icon } from "../../design/icons";

interface RewindMarkerProps {
  restored: number;
  deleted: number;
  onDismiss: () => void;
}

export function RewindMarker({ restored, deleted, onDismiss }: RewindMarkerProps) {
  return (
    <div className="rewind-marker" role="status">
      <div className="rewind-marker-line" />
      <div className="rewind-marker-body">
        <Icon name="history" size={11} />
        <span>
          Rewound —{" "}
          {restored > 0 && `${restored} file${restored !== 1 ? "s" : ""} restored`}
          {restored > 0 && deleted > 0 && ", "}
          {deleted > 0 && `${deleted} deleted`}
          {restored === 0 && deleted === 0 && "no file changes"}
        </span>
        <button
          type="button"
          className="rewind-marker-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="rewind-marker-line" />
    </div>
  );
}
