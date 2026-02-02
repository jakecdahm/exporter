import React from "react";

interface ExportOptionsProps {
  exportType: "clips" | "sequences";
  onExportTypeChange: (value: "clips" | "sequences") => void;
}

const ExportOptions: React.FC<ExportOptionsProps> = ({
  exportType,
  onExportTypeChange,
}) => {
  return (
    <div className="export-options">
      <div className="option-row">
        <span className="option-label">Export:</span>
        <select
          className="option-select"
          value={exportType}
          onChange={(e) => onExportTypeChange(e.target.value as "clips" | "sequences")}
        >
          <option value="clips">Selected Clips</option>
          <option value="sequences">Selected Sequences</option>
        </select>
      </div>
      <div className="option-hint">
        Filename format: 001 - Sequence Name.ext
      </div>
    </div>
  );
};

export default ExportOptions;
