import React from "react";
import { evalTS } from "../../lib/utils/bolt";

interface DirectorySelectorProps {
  currentPath: string;
  recentPaths: string[];
  onChange: (path: string) => void;
}

const DirectorySelector: React.FC<DirectorySelectorProps> = ({
  currentPath,
  recentPaths,
  onChange,
}) => {
  const handleBrowse = async () => {
    try {
      const result = await evalTS("selectOutputFolder");
      if (result && "path" in result && result.path) {
        onChange(result.path);
      }
    } catch (error) {
      console.error("Failed to select folder:", error);
    }
  };

  const handleProjectFolder = async () => {
    try {
      const result = await evalTS("claude_getProjectDirectory") as any;
      if (result && result.path) {
        onChange(result.path);
      } else if (result && result.error) {
        console.error("Project folder:", result.error);
      }
    } catch (error) {
      console.error("Failed to get project folder:", error);
    }
  };

  const getDisplayName = (path: string): string => {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  };

  return (
    <div className="directory-selector">
      <div className="directory-input-row">
        <input
          type="text"
          className="directory-input"
          value={currentPath}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Select output directory..."
        />
        <button className="browse-button" onClick={handleBrowse}>
          Browse
        </button>
      </div>
      <div className="recent-paths">
        <button
          className="recent-path project-path"
          onClick={handleProjectFolder}
          title="Use project file location"
        >
          Project
        </button>
        {recentPaths.slice(0, 4).map((path, index) => (
          <button
            key={index}
            className="recent-path"
            onClick={() => onChange(path)}
            title={path}
          >
            {getDisplayName(path)}
          </button>
        ))}
      </div>
    </div>
  );
};

export default DirectorySelector;
