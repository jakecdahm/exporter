import React from "react";
import { ExportHistoryEntry } from "../hooks/useExportHistory";

interface HistoryModalProps {
  history: ExportHistoryEntry[];
  onClose: () => void;
  onClear: () => void;
}

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
  </svg>
);

const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
};

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
};

const getFolderName = (path: string): string => {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
};

const HistoryModal: React.FC<HistoryModalProps> = ({ history, onClose, onClear }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Export History</h2>
          <button className="icon-button" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-content">
          {history.length === 0 ? (
            <div className="history-empty">No exports yet</div>
          ) : (
            <div className="history-list">
              {history.map((entry) => (
                <div key={entry.id} className="history-item">
                  <div className="history-item-header">
                    <span className="history-date">{formatDate(entry.timestamp)}</span>
                    <span className={`history-status ${entry.failedCount > 0 ? "has-failed" : "all-success"}`}>
                      {entry.failedCount > 0
                        ? `${entry.successCount}/${entry.totalItems}`
                        : `${entry.successCount} items`}
                    </span>
                  </div>
                  <div className="history-item-details">
                    <span className="history-folder" title={entry.outputDirectory}>
                      {getFolderName(entry.outputDirectory)}
                    </span>
                    <span className="history-stats">
                      {formatDuration(entry.totalDurationSeconds)} · {formatFileSize(entry.totalSizeBytes)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div className="modal-footer">
            <button className="text-button" onClick={onClear}>
              Clear History
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryModal;
