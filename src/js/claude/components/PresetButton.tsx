import React from "react";
import { PresetAssignment } from "../App";

interface PresetButtonProps {
  slot: 1 | 2 | 3 | 4 | 5;
  preset: PresetAssignment | null;
  onClick: () => void;
  onAssign: () => void;
}

const PresetButton: React.FC<PresetButtonProps> = ({ slot, preset, onClick, onAssign }) => {
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onAssign();
  };

  return (
    <button
      className={`preset-button ${!preset ? "empty" : ""}`}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      title={preset ? preset.displayName : "Click to assign preset"}
    >
      <span className="preset-name">{preset ? preset.displayName : "Click to assign"}</span>
      <span className="preset-slot">Preset {slot}</span>
      {preset && (
        <span className="preset-assign" onClick={(e) => { e.stopPropagation(); onAssign(); }}>
          Edit
        </span>
      )}
    </button>
  );
};

export default PresetButton;
