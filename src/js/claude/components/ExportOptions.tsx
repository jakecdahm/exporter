import React from "react";

interface ExportOptionsProps {
  exportType: "clips" | "sequences";
  filenamePattern: "seq_clip" | "seq_date" | "clip_only" | "custom";
  customFilename: string;
  onExportTypeChange: (value: "clips" | "sequences") => void;
  onFilenamePatternChange: (value: "seq_clip" | "seq_date" | "clip_only" | "custom") => void;
  onCustomFilenameChange: (value: string) => void;
}

const filenamePatterns = [
  { value: "seq_clip", label: "Sequence_Clip_#", example: "MySeq_ClipName_1.mp4" },
  { value: "seq_date", label: "Sequence_Date", example: "MySeq_2026-01-31.mp4" },
  { value: "clip_only", label: "Clip_#", example: "ClipName_1.mp4" },
  { value: "custom", label: "Custom", example: "" },
];

const ExportOptions: React.FC<ExportOptionsProps> = ({
  exportType,
  filenamePattern,
  customFilename,
  onExportTypeChange,
  onFilenamePatternChange,
  onCustomFilenameChange,
}) => {
  return (
    <div className="export-options">
      <div className="option-row">
        <span className="option-label">Filename:</span>
        <select
          className="option-select"
          value={filenamePattern}
          onChange={(e) => onFilenamePatternChange(e.target.value as any)}
        >
          {filenamePatterns.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {filenamePattern === "custom" && (
        <div className="option-row">
          <input
            type="text"
            className="filename-input"
            value={customFilename}
            onChange={(e) => onCustomFilenameChange(e.target.value)}
            placeholder="MyExport_{i}"
          />
        </div>
      )}

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
    </div>
  );
};

export default ExportOptions;
