import React from "react";
import FilenameCustomizer from "./FilenameCustomizer";

const MARKER_COLORS: { index: number; label: string; hex: string }[] = [
  { index: 0, label: "Green", hex: "#3dcc5b" },
  { index: 1, label: "Red", hex: "#e05555" },
  { index: 2, label: "Purple", hex: "#9b59b6" },
  { index: 3, label: "Orange", hex: "#e8912d" },
  { index: 4, label: "Yellow", hex: "#e8d44d" },
  { index: 5, label: "White", hex: "#e0e0e0" },
  { index: 6, label: "Blue", hex: "#4a90d9" },
  { index: 7, label: "Cyan", hex: "#47c8c8" },
];

interface ExportOptionsProps {
  filenameTemplate: string;
  onFilenameTemplateChange: (template: string) => void;
  onLog?: (type: "info" | "success" | "error" | "warning", message: string) => void;
  exportType: "clips" | "sequences" | "markers";
  markerSubMode?: "video" | "stills";
  onMarkerSubModeChange?: (mode: "video" | "stills") => void;
  markerSecondsBefore?: number;
  markerSecondsAfter?: number;
  onMarkerSecondsBeforeChange?: (seconds: number) => void;
  onMarkerSecondsAfterChange?: (seconds: number) => void;
  markerColorFilter?: number[];
  onMarkerColorFilterChange?: (colors: number[]) => void;
}

const DURATION_PRESETS = [3, 5, 10, 30];

const ExportOptions: React.FC<ExportOptionsProps> = ({
  filenameTemplate,
  onFilenameTemplateChange,
  onLog,
  exportType,
  markerSubMode,
  onMarkerSubModeChange,
  markerSecondsBefore,
  markerSecondsAfter,
  onMarkerSecondsBeforeChange,
  onMarkerSecondsAfterChange,
  markerColorFilter,
  onMarkerColorFilterChange,
}) => {
  const activeColors = markerColorFilter ?? [0, 1, 2, 3, 4, 5, 6, 7];
  const allSelected = activeColors.length === 8;

  const toggleColor = (index: number) => {
    if (activeColors.includes(index)) {
      if (activeColors.length === 1) return; // Don't allow deselecting all
      onMarkerColorFilterChange?.(activeColors.filter((c) => c !== index));
    } else {
      onMarkerColorFilterChange?.([...activeColors, index]);
    }
  };

  const toggleAll = () => {
    if (allSelected) return;
    onMarkerColorFilterChange?.([0, 1, 2, 3, 4, 5, 6, 7]);
  };
  return (
    <div className="export-options">
      <FilenameCustomizer
        template={filenameTemplate}
        onTemplateChange={onFilenameTemplateChange}
        extension={exportType === "markers" && markerSubMode === "stills" ? ".jpg" : ".mp4"}
        exportType={exportType}
        onLog={onLog}
      />

      {exportType === "markers" && (
        <div className="marker-options">
          <div className="marker-submode-toggle">
            <button
              className={`header-toggle-btn ${markerSubMode === "video" ? "active" : ""}`}
              onClick={() => onMarkerSubModeChange?.("video")}
            >
              Video
            </button>
            <button
              className={`header-toggle-btn ${markerSubMode === "stills" ? "active" : ""}`}
              onClick={() => onMarkerSubModeChange?.("stills")}
            >
              Stills
            </button>
          </div>

          <div className="marker-color-filter">
            <div className="marker-color-filter-row">
              <button
                className={`marker-color-all ${allSelected ? "active" : ""}`}
                onClick={toggleAll}
                title="All colors"
              >
                All
              </button>
              {MARKER_COLORS.map((color) => (
                <button
                  key={color.index}
                  className={`marker-color-dot ${activeColors.includes(color.index) ? "active" : ""}`}
                  style={{ "--dot-color": color.hex } as React.CSSProperties}
                  onClick={() => toggleColor(color.index)}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          {markerSubMode === "video" && (
            <div className="marker-duration-controls">
              <div className="marker-duration-row">
                <label className="marker-duration-label">Before</label>
                <input
                  type="number"
                  className="marker-duration-input"
                  value={markerSecondsBefore ?? 5}
                  min={0}
                  step={1}
                  onChange={(e) => onMarkerSecondsBeforeChange?.(Number(e.target.value) || 0)}
                />
                <span className="marker-duration-unit">sec</span>
              </div>
              <div className="marker-duration-row">
                <label className="marker-duration-label">After</label>
                <input
                  type="number"
                  className="marker-duration-input"
                  value={markerSecondsAfter ?? 5}
                  min={0}
                  step={1}
                  onChange={(e) => onMarkerSecondsAfterChange?.(Number(e.target.value) || 0)}
                />
                <span className="marker-duration-unit">sec</span>
              </div>
              <div className="marker-duration-presets">
                {DURATION_PRESETS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    className="token-button"
                    onClick={() => {
                      onMarkerSecondsBeforeChange?.(sec);
                      onMarkerSecondsAfterChange?.(sec);
                    }}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExportOptions;
