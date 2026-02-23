import React from "react";
import { PresetAssignment } from "../App";

interface PresetButtonProps {
  slot: 1 | 2 | 3 | 4 | 5;
  preset: PresetAssignment | null;
  onClick: () => void;
  onAssign: () => void;
  onExportNow: () => void;
  onClear: () => void;
}

const PresetButton: React.FC<PresetButtonProps> = ({ slot, preset, onClick, onAssign, onExportNow, onClear }) => {
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onAssign();
  };

  if (!preset) {
    return (
      <button
        className="preset-button empty"
        onClick={onClick}
        title="Click to assign preset"
      >
        <span className="preset-name">+</span>
      </button>
    );
  }

  return (
    <div className="preset-button" onContextMenu={handleContextMenu} title={preset.displayName}>
      <span className="preset-name">{preset.displayName}</span>
      <div className="preset-button-overlay">
        <button className="preset-clear" onClick={onClear}>&times;</button>
        <button className="preset-action preset-action--queue" onClick={onClick}>
          Queue
        </button>
        <button className="preset-action preset-action--export" onClick={onExportNow}>
          Export Now
        </button>
      </div>
    </div>
  );
};

export default PresetButton;
