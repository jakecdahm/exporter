import React from "react";

interface FooterProps {
  isExporting: boolean;
  progress: number;
  status: string;
  queueCount: number;
  exportMethod: "direct" | "ame";
  onExportMethodChange: (method: "direct" | "ame") => void;
  onExport: () => void;
  onLogClick: () => void;
}

const LogIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z" />
    <path d="M3 4h10v1H3V4zm0 3h10v1H3V7zm0 3h6v1H3v-1z" />
  </svg>
);

const Footer: React.FC<FooterProps> = ({
  isExporting,
  progress,
  status,
  queueCount,
  exportMethod,
  onExportMethodChange,
  onExport,
  onLogClick,
}) => {
  const canExport = queueCount > 0 && !isExporting;

  return (
    <footer className="footer">
      <div className="footer-progress-bar" style={{ width: `${progress}%` }} />
      <div className="footer-content">
        <div className="footer-left">
          <button
            className={`button button--primary footer-export-btn ${!canExport ? "disabled" : ""}`}
            onClick={onExport}
            disabled={!canExport}
          >
            {isExporting
              ? `Exporting ${Math.round(progress)}%`
              : queueCount > 0
              ? `Export (${queueCount})`
              : "Export"}
          </button>
          <div className="export-method-toggle">
            <button
              className={`toggle-btn ${exportMethod === "direct" ? "active" : ""}`}
              onClick={() => onExportMethodChange("direct")}
              title="Export directly in Premiere (faster)"
            >
              Direct
            </button>
            <button
              className={`toggle-btn ${exportMethod === "ame" ? "active" : ""}`}
              onClick={() => onExportMethodChange("ame")}
              title="Queue to Adobe Media Encoder (background)"
            >
              AME
            </button>
          </div>
        </div>
        <div className="footer-right">
          <span className="status-text">{status}</span>
          <button
            className="icon-button"
            onClick={onLogClick}
            title="View logs"
          >
            <LogIcon />
          </button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
