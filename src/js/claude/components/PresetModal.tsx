import React, { useState, useMemo } from "react";
import { PresetInfo } from "../App";

interface PresetModalProps {
  presets: PresetInfo[];
  onSelect: (preset: PresetInfo) => void;
  onClose: () => void;
  onRefresh: () => void;
}

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z" />
    <path
      fillRule="evenodd"
      d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 4.9 4c1.552 0 2.94-.707 3.857-1.818a.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"
    />
  </svg>
);

const PresetModal: React.FC<PresetModalProps> = ({ presets, onSelect, onClose, onRefresh }) => {
  const [search, setSearch] = useState("");

  const filteredPresets = useMemo(() => {
    if (!search.trim()) return presets;
    const lower = search.toLowerCase();
    return presets.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        (p.exporter && p.exporter.toLowerCase().includes(lower))
    );
  }, [presets, search]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal">
        <div className="modal-header">
          <h2>Select Preset</h2>
          <div style={{ display: "flex", gap: "4px" }}>
            <button className="icon-button" onClick={onRefresh} title="Refresh presets">
              <RefreshIcon />
            </button>
            <button className="icon-button" onClick={onClose} title="Close">
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="modal-search">
          <input
            type="text"
            placeholder="Search presets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="modal-content">
          {filteredPresets.length > 0 ? (
            filteredPresets.map((preset, index) => (
              <div
                key={`${preset.name}-${index}`}
                className="preset-list-item"
                onClick={() => onSelect(preset)}
              >
                <div className="preset-list-name">{preset.name}</div>
                {preset.exporter && <div className="preset-list-exporter">{preset.exporter}</div>}
              </div>
            ))
          ) : (
            <div className="modal-empty">
              {presets.length === 0
                ? "No presets found. Click refresh to load presets from Media Encoder."
                : "No presets match your search."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PresetModal;
