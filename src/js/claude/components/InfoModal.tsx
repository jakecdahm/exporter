import React, { useRef, useEffect, useState } from "react";
import { LogMessage } from "../App";
import { SavedQueue } from "../hooks/useSavedQueues";

interface InfoModalProps {
  activeTab: "logs" | "history";
  onTabChange: (tab: "logs" | "history") => void;
  onClose: () => void;
  logs: LogMessage[];
  savedQueues: SavedQueue[];
  onLoadQueue: (queue: SavedQueue) => void;
  onDeleteQueue: (id: string) => void;
  onClearQueues: () => void;
}

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z" />
    <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z" />
  </svg>
);

const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
    <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
  </svg>
);

const LOG_ICONS: Record<LogMessage["type"], string> = {
  success: "\u2713",
  error: "\u2717",
  warning: "\u26A0",
  info: "\u2192",
};

const formatTime = (date: Date): string => {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const InfoModal: React.FC<InfoModalProps> = ({
  activeTab,
  onTabChange,
  onClose,
  logs,
  savedQueues,
  onLoadQueue,
  onDeleteQueue,
  onClearQueues,
}) => {
  const logContentRef = useRef<HTMLDivElement>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  useEffect(() => {
    if (activeTab === "logs" && logContentRef.current) {
      logContentRef.current.scrollTop = logContentRef.current.scrollHeight;
    }
  }, [logs, activeTab]);

  const handleCopy = () => {
    const logText = logs
      .map((log) => `[${formatTime(log.timestamp)}] [${log.type.toUpperCase()}] ${log.message}`)
      .join("\n");

    const textarea = document.createElement("textarea");
    textarea.value = logText;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      document.execCommand("copy");
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }

    document.body.removeChild(textarea);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="info-tabs">
            <button
              className={`info-tab ${activeTab === "logs" ? "active" : ""}`}
              onClick={() => onTabChange("logs")}
            >
              Logs
            </button>
            <button
              className={`info-tab ${activeTab === "history" ? "active" : ""}`}
              onClick={() => onTabChange("history")}
            >
              History
            </button>
          </div>
          <button className="icon-button" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {activeTab === "logs" && (
          <>
            <div className="info-log-header">
              <button className="icon-button" onClick={handleCopy} title="Copy log">
                {copyFeedback ? "\u2713" : <CopyIcon />}
              </button>
            </div>
            <div className="info-log-content" ref={logContentRef}>
              {logs.map((log, index) => (
                <div key={index} className={`log-entry ${log.type}`}>
                  <span className="log-icon">{LOG_ICONS[log.type]}</span>
                  <span className="log-time">{formatTime(log.timestamp)}</span>
                  {log.message}
                </div>
              ))}
              {logs.length === 0 && <div className="log-entry info">No log entries yet.</div>}
            </div>
          </>
        )}

        {activeTab === "history" && (
          <>
            <div className="modal-content">
              {savedQueues.length === 0 ? (
                <div className="modal-empty">No saved queues</div>
              ) : (
                <div className="saved-queue-list">
                  {savedQueues.map((sq) => (
                    <div
                      key={sq.id}
                      className="saved-queue-item"
                      onClick={() => onLoadQueue(sq)}
                    >
                      <div className="saved-queue-header">
                        <span className="saved-queue-date">{formatDate(sq.timestamp)}</span>
                        <div className="saved-queue-actions">
                          <span className="saved-queue-count">{sq.items.length} items</span>
                          <button
                            className="icon-button icon-button--small saved-queue-delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteQueue(sq.id);
                            }}
                            title="Delete saved queue"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                      <div className="saved-queue-presets">
                        {[...new Set(sq.items.map((item) => item.preset.displayName))].join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {savedQueues.length > 0 && (
              <div className="modal-footer">
                <button className="text-button" onClick={onClearQueues}>
                  Clear All
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default InfoModal;
