import React, { useRef } from "react";
import { TOKENS, SEPARATORS, generatePreview, DEFAULT_TEMPLATE } from "../utils/filenameTokens";

interface FilenameCustomizerProps {
  template: string;
  onTemplateChange: (template: string) => void;
  extension?: string;
}

const FilenameCustomizer: React.FC<FilenameCustomizerProps> = ({
  template,
  onTemplateChange,
  extension = ".mp4",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

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
      </div>
    </div>
  );
};

export default FilenameCustomizer;
