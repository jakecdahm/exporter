import React from "react";
import { QueueItem } from "../App";

interface QueuePanelProps {
  queue: QueueItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onSaveQueue: () => void;
  isProcessing: boolean;
}

const SaveIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4.414a1 1 0 0 0-.293-.707L11.293 1.293A1 1 0 0 0 10.586 1H2zm0 1h8.586L13 4.414V14H3V2h-1zm2 7h8v4H4V9zm1 1v2h6v-2H5zm0-6h4v3H5V4zm1 1v1h2V5H6z" />
  </svg>
);

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
  pending: "var(--text-secondary)",
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

const MARKER_COLOR_HEX: Record<number, string> = {
  0: "#3dcc5b",
  1: "#e05555",
  2: "#9b59b6",
  3: "#e8912d",
  4: "#e8d44d",
  5: "#e0e0e0",
  6: "#4a90d9",
  7: "#47c8c8",
};

// Premiere Pro uses 254016000000 ticks per second
const TICKS_PER_SECOND = 254016000000;

const formatDuration = (startTicks?: number, endTicks?: number): string => {
  if (startTicks === undefined || endTicks === undefined) return "";

  const durationTicks = endTicks - startTicks;
  if (durationTicks <= 0) return "";

  const totalSeconds = Math.floor(durationTicks / TICKS_PER_SECOND);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const QueuePanel: React.FC<QueuePanelProps> = ({
  queue,
  onRemove,
  onClear,
  onSaveQueue,
  isProcessing,
}) => {
  const hasPending = queue.some((item) => item.status === "pending");

  if (queue.length === 0) {
    return (
      <section className="section queue-section">
        <div className="section-label">Export Queue</div>
        <div className="queue-empty">
          <span className="queue-empty-icon">📦</span>
          <span>Queue is empty</span>
          <span className="queue-empty-hint">
            Select clips/sequences, then click a preset
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="section queue-section">
      <div className="section-header">
        <div className="section-label">Export Queue ({queue.length})</div>
        <div className="section-header-actions">
          {hasPending && !isProcessing && (
            <button
              className="icon-button icon-button--small"
              onClick={onSaveQueue}
              title="Save queue"
            >
              <SaveIcon />
            </button>
          )}
          <button
            className="text-button"
            onClick={onClear}
            disabled={isProcessing}
            title="Clear all"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="queue-list">
        {queue.map((item) => {
          const folderName = item.outputPath.split(/[/\\]/).pop() || item.outputPath;

          return (
            <div key={item.id} className={`queue-item queue-item--${item.status}`}>
              <div className="queue-item-info">
                {item.colorIndex !== undefined && MARKER_COLOR_HEX[item.colorIndex] && (
                  <span
                    className="queue-item-color-dot"
                    style={{ backgroundColor: MARKER_COLOR_HEX[item.colorIndex] }}
                  />
                )}
                <div className="queue-item-text">
                  <span className="queue-item-name" title={`${item.outputPath}/${item.expectedFilename}`}>
                    {item.expectedFilename}
                  </span>
                  <span className="queue-item-folder" title={item.outputPath}>
                    {folderName}
                  </span>
                </div>
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
          );
        })}
      </div>
    </section>
  );
};

export default QueuePanel;
