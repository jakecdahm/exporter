import React from "react";
import { evalTS } from "../../lib/utils/bolt";
import { child_process } from "../../lib/cep/node";

interface SettingsModalProps {
  logEnabled: boolean;
  logDirectory: string;
  exportCutsJson: boolean;
  onLogEnabledChange: (enabled: boolean) => void;
  onLogDirectoryChange: (path: string) => void;
  onExportCutsJsonChange: (enabled: boolean) => void;
  onDeactivate: () => Promise<{ success: boolean; error?: string }>;
  isDeactivating: boolean;
  onClose: () => void;
}

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
  </svg>
);

const FolderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3H14a2 2 0 0 1 2 2v3H0V5a2 2 0 0 1 .54-1.13zM16 8H0v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  </svg>
);

const ExternalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path fillRule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
    <path fillRule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
  </svg>
);

const SettingsModal: React.FC<SettingsModalProps> = ({
  logEnabled,
  logDirectory,
  exportCutsJson,
  onLogEnabledChange,
  onLogDirectoryChange,
  onExportCutsJsonChange,
  onDeactivate,
  isDeactivating,
  onClose,
}) => {
  const handleBrowse = async () => {
    try {
      const result = await evalTS("selectOutputFolder");
      if (result && "path" in result && result.path) {
        onLogDirectoryChange(result.path);
      }
    } catch (error) {
      console.error("Failed to select folder:", error);
    }
  };

  const handleOpenFolder = () => {
    if (!logDirectory) return;
    try {
      child_process.exec(`open "${logDirectory}"`);
    } catch (error) {
      console.error("Failed to open folder:", error);
    }
  };

  const getDisplayPath = (path: string): string => {
    // Show last two path segments for context
    const parts = path.split(/[/\\]/);
    if (parts.length <= 2) return path;
    return "..." + parts.slice(-2).join("/");
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="icon-button" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-content">
          <div className="settings-section">
            <div className="settings-row">
              <label className="settings-label">
                <input
                  type="checkbox"
                  checked={exportCutsJson}
                  onChange={(e) => onExportCutsJsonChange(e.target.checked)}
                />
                <span>Export cuts as JSON</span>
              </label>
            </div>

            <div className="settings-row">
              <label className="settings-label">
                <input
                  type="checkbox"
                  checked={logEnabled}
                  onChange={(e) => onLogEnabledChange(e.target.checked)}
                />
                <span>Enable CSV export log</span>
              </label>
            </div>

            <div className={`settings-row ${!logEnabled ? "disabled" : ""}`}>
              <span className="settings-field-label">Log directory:</span>
              <div className="settings-directory-row">
                <input
                  type="text"
                  className="settings-input"
                  value={logDirectory}
                  onChange={(e) => onLogDirectoryChange(e.target.value)}
                  placeholder="Select log directory..."
                  disabled={!logEnabled}
                  title={logDirectory}
                />
                <button
                  className="icon-button"
                  onClick={handleBrowse}
                  disabled={!logEnabled}
                  title="Browse for folder"
                >
                  <FolderIcon />
                </button>
                <button
                  className="icon-button"
                  onClick={handleOpenFolder}
                  disabled={!logEnabled || !logDirectory}
                  title="Open in Finder"
                >
                  <ExternalIcon />
                </button>
              </div>
            </div>
          </div>

          <div className="settings-section settings-license-section">
            <span className="settings-field-label">License</span>
            <button
              className="text-button text-button--danger"
              onClick={onDeactivate}
              disabled={isDeactivating}
            >
              {isDeactivating ? "Deactivating..." : "Deactivate License"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
