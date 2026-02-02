import React, { useRef, useEffect } from "react";
import { LogMessage } from "../App";

interface LogDrawerProps {
  isOpen: boolean;
  logs: LogMessage[];
}

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z" />
    <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z" />
  </svg>
);

const formatTime = (date: Date): string => {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const LOG_ICONS: Record<LogMessage["type"], string> = {
  success: "✓",
  error: "✗",
  warning: "⚠",
  info: "→",
};

const LogDrawer: React.FC<LogDrawerProps> = ({ isOpen, logs }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [copyFeedback, setCopyFeedback] = React.useState(false);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopy = () => {
    const logText = logs
      .map((log) => `[${formatTime(log.timestamp)}] [${log.type.toUpperCase()}] ${log.message}`)
      .join("\n");

    // Create a temporary textarea to copy text (works in CEP)
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
    <div className={`log-drawer ${isOpen ? "open" : ""}`}>
      <div className="log-drawer-content">
        <div className="log-drawer-header">
          <span>Log</span>
          <button className="icon-button" onClick={handleCopy} title="Copy log">
            {copyFeedback ? "✓" : <CopyIcon />}
          </button>
        </div>
        <div className="log-content" ref={contentRef}>
          {logs.map((log, index) => (
            <div key={index} className={`log-entry ${log.type}`}>
              <span className="log-icon">{LOG_ICONS[log.type]}</span>
              <span className="log-time">{formatTime(log.timestamp)}</span>
              {log.message}
            </div>
          ))}
          {logs.length === 0 && <div className="log-entry info">No log entries yet.</div>}
        </div>
      </div>
    </div>
  );
};

export default LogDrawer;
