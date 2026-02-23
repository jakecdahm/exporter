import React, { useRef, useState, useEffect } from "react";
import { evalTS } from "../../lib/utils/bolt";
import { child_process } from "../../lib/cep/node";

interface DirectorySelectorProps {
  currentPath: string;
  recentPaths: string[];
  onChange: (path: string) => void;
}

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

const DirectorySelector: React.FC<DirectorySelectorProps> = ({
  currentPath,
  recentPaths,
  onChange,
}) => {
  const recentRef = useRef<HTMLDivElement>(null);
  const [maxVisible, setMaxVisible] = useState(4);

  useEffect(() => {
    const el = recentRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        // Project button ~60px, each recent button ~120px avg, gap ~6px
        const available = width - 66;
        const count = Math.max(1, Math.floor(available / 126));
        setMaxVisible(count);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
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

  const handleOpenFolder = () => {
    if (!currentPath) return;
    try {
      // Use 'open' command on macOS to open folder in Finder
      child_process.exec(`open "${currentPath}"`);
    } catch (error) {
      console.error("Failed to open folder:", error);
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
        <button className="icon-button" onClick={handleBrowse} title="Browse for folder">
          <FolderIcon />
        </button>
        <button
          className="icon-button"
          onClick={handleOpenFolder}
          disabled={!currentPath}
          title="Open in Finder"
        >
          <ExternalIcon />
        </button>
      </div>
      <div className="recent-paths" ref={recentRef}>
        <button
          className="recent-path project-path"
          onClick={handleProjectFolder}
          title="Use project file location"
        >
          Project
        </button>
        {recentPaths.slice(0, maxVisible).map((path, index) => (
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
