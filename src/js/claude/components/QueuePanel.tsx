import React from "react";
import { QueueItem } from "../App";

interface QueuePanelProps {
  queue: QueueItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  isProcessing: boolean;
}

const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
    <path
      fillRule="evenodd"
      d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
    />
  </svg>
);

const statusColors: Record<QueueItem["status"], string> = {
  pending: "var(--color-text-secondary)",
  exporting: "var(--color-accent)",
  completed: "var(--color-success)",
  failed: "var(--color-error)",
};

const statusLabels: Record<QueueItem["status"], string> = {
  pending: "",
  exporting: "...",
  completed: "Done",
  failed: "Failed",
};

const QueuePanel: React.FC<QueuePanelProps> = ({
  queue,
  onRemove,
  onClear,
  isProcessing,
}) => {
  if (queue.length === 0) {
    return (
      <section className="section queue-section">
        <div className="section-label">Export Queue</div>
        <div className="queue-empty">
          Click a preset button to add clips/sequences to the queue
        </div>
      </section>
    );
  }

  return (
    <section className="section queue-section">
      <div className="section-header">
        <div className="section-label">Export Queue ({queue.length} items)</div>
        <button
          className="text-button"
          onClick={onClear}
          disabled={isProcessing}
          title="Clear all"
        >
          Clear
        </button>
      </div>

      <div className="queue-list">
        {queue.map((item) => (
          <div key={item.id} className={`queue-item queue-item--${item.status}`}>
            <div className="queue-item-info">
              <span className="queue-item-name">{item.expectedFilename}</span>
              <span className="queue-item-preset">{item.preset.displayName}</span>
            </div>
            <div className="queue-item-actions">
              {statusLabels[item.status] && (
                <span
                  className="queue-item-status"
                  style={{ color: statusColors[item.status] }}
                >
                  {statusLabels[item.status]}
                </span>
              )}
              {item.status === "pending" && !isProcessing && (
                <button
                  className="icon-button icon-button--small"
                  onClick={() => onRemove(item.id)}
                  title="Remove from queue"
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default QueuePanel;
