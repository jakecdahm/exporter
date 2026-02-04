import React, { useRef, useState } from "react";
import { TOKENS, SEPARATORS, generatePreview, DEFAULT_TEMPLATE } from "../utils/filenameTokens";
import { evalTS } from "../../lib/utils/bolt";

interface FilenameCustomizerProps {
  template: string;
  onTemplateChange: (template: string) => void;
  extension?: string;
  onLog?: (type: "info" | "success" | "error" | "warning", message: string) => void;
}

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
      <div className="filename-label">Filename:</div>

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
          className="text-button"
          onClick={handleClear}
          title="Clear template"
        >
          Clear
        </button>
        <button
          type="button"
          className="text-button"
          onClick={handleReset}
          title="Reset to default"
        >
          Reset
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

      <div className="filename-preview">
        <span className="preview-label">Preview:</span>
        <span className="preview-value">{preview}</span>
        <button
          type="button"
          className="text-button rename-button"
          onClick={handleRename}
          disabled={isRenaming}
          title="Rename selected clips to match this filename pattern"
        >
          {isRenaming ? "Renaming..." : "Rename"}
        </button>
      </div>
    </div>
  );
};

export default FilenameCustomizer;
