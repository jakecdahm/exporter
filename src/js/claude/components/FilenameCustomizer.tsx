import React, { useRef, useState } from "react";
import { TOKENS, SEPARATORS, generatePreview, DEFAULT_TEMPLATE } from "../utils/filenameTokens";
import { evalTS } from "../../lib/utils/bolt";

interface FilenameCustomizerProps {
  template: string;
  onTemplateChange: (template: string) => void;
  extension?: string;
  onLog?: (type: "info" | "success" | "error" | "warning", message: string) => void;
}

const ClearIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
  </svg>
);

const ResetIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path fillRule="evenodd" d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/>
    <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/>
  </svg>
);

const FilenameCustomizer: React.FC<FilenameCustomizerProps> = ({
  template,
  onTemplateChange,
  extension = ".mp4",
  onLog,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  const insertAtCursor = (text: string) => {
    const input = inputRef.current;
    if (!input) {
      onTemplateChange(template + text);
      return;
    }

    const start = input.selectionStart ?? template.length;
    const end = input.selectionEnd ?? template.length;
    const newValue = template.slice(0, start) + text + template.slice(end);
    onTemplateChange(newValue);

    // Restore cursor position after insertion
    setTimeout(() => {
      input.focus();
      const newCursor = start + text.length;
      input.setSelectionRange(newCursor, newCursor);
    }, 0);
  };

  const handleClear = () => {
    onTemplateChange("");
    inputRef.current?.focus();
  };

  const handleReset = () => {
    onTemplateChange(DEFAULT_TEMPLATE);
    inputRef.current?.focus();
  };

  const handleRename = async () => {
    if (isRenaming) return;

    setIsRenaming(true);
    try {
      const result = (await evalTS("claude_renameSelectedClips", {
        template: template || DEFAULT_TEMPLATE,
      })) as any;

      if (result && result.error) {
        onLog?.("warning", result.error);
      } else if (result) {
        const count = result.renamed || 0;
        if (count > 0) {
          onLog?.("success", `Renamed ${count} clips`);
        } else {
          onLog?.("warning", "No clips renamed");
        }
      }
    } catch (error: any) {
      onLog?.("error", `Rename failed: ${error?.message || error}`);
    } finally {
      setIsRenaming(false);
    }
  };

  const preview = generatePreview(template || DEFAULT_TEMPLATE, extension);

  return (
    <div className="filename-customizer">
      <div className="filename-header">
        <span className="filename-label">Filename:</span>
        <span className="filename-preview-value">{preview}</span>
        <button
          type="button"
          className="rename-button"
          onClick={handleRename}
          disabled={isRenaming}
          title="Rename selected clips to match this filename pattern"
        >
          {isRenaming ? "Renaming..." : "Rename"}
        </button>
      </div>

      <div className="filename-input-row">
        <input
          ref={inputRef}
          type="text"
          className="filename-input"
          value={template}
          onChange={(e) => onTemplateChange(e.target.value)}
          placeholder={DEFAULT_TEMPLATE}
        />
        <button
          type="button"
          className="icon-button small"
          onClick={handleClear}
          title="Clear template"
        >
          <ClearIcon />
        </button>
        <button
          type="button"
          className="icon-button small"
          onClick={handleReset}
          title="Reset to default"
        >
          <ResetIcon />
        </button>
      </div>

      <div className="filename-tokens">
        {TOKENS.map((token) => (
          <button
            key={token.key}
            type="button"
            className="token-button"
            onClick={() => insertAtCursor(token.key)}
            title={token.description}
          >
            {token.label}
          </button>
        ))}
        <span className="token-separator-divider">|</span>
        {SEPARATORS.map((sep) => (
          <button
            key={sep.key}
            type="button"
            className="token-button separator"
            onClick={() => insertAtCursor(sep.key)}
          >
            {sep.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default FilenameCustomizer;
