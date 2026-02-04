import React from "react";
import FilenameCustomizer from "./FilenameCustomizer";

interface ExportOptionsProps {
  exportType: "clips" | "sequences";
  onExportTypeChange: (value: "clips" | "sequences") => void;
  filenameTemplate: string;
  onFilenameTemplateChange: (template: string) => void;
  onLog?: (type: "info" | "success" | "error" | "warning", message: string) => void;
}

const ExportOptions: React.FC<ExportOptionsProps> = ({
  exportType,
  onExportTypeChange,
  filenameTemplate,
  onFilenameTemplateChange,
  onLog,
}) => {
  return (
    <div className="export-options">
      <div className="option-row">
        <span className="option-label">Export:</span>
        <div className="export-type-toggle">
          <button
            className={`toggle-btn ${exportType === "clips" ? "active" : ""}`}
            onClick={() => onExportTypeChange("clips")}
          >
            Selected Clips
          </button>
          <button
            className={`toggle-btn ${exportType === "sequences" ? "active" : ""}`}
            onClick={() => onExportTypeChange("sequences")}
          >
            Active Sequences
          </button>
        </div>
      </div>

      <FilenameCustomizer
        template={filenameTemplate}
        onTemplateChange={onFilenameTemplateChange}
        onLog={onLog}
      />
    </div>
  );
};

export default ExportOptions;
