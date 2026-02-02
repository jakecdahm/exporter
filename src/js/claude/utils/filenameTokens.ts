// Filename token definitions
export interface TokenDef {
  key: string;
  label: string;
  display: string;
  description: string;
}

export interface SeparatorDef {
  key: string;
  label: string;
}

export const TOKENS: TokenDef[] = [
  { key: "{index}", label: "Index", display: "001", description: "Zero-padded number" },
  { key: "{sequence}", label: "Sequence", display: "Sequence", description: "Sequence name" },
  { key: "{clip}", label: "Clip", display: "Clip", description: "Clip name (if exporting clips)" },
];

export const SEPARATORS: SeparatorDef[] = [
  { key: "_", label: "_" },
  { key: " - ", label: "-" },
  { key: " ", label: "␣" },
];

export interface FilenameContext {
  index: number;
  sequenceName: string;
  clipName?: string;
}

// Generate filename from template
export const generateFilename = (
  template: string,
  context: FilenameContext,
  extension: string = ".mp4"
): string => {
  if (!template.trim()) {
    // Default format if template is empty
    const paddedIndex = String(context.index + 1).padStart(3, "0");
    return `${paddedIndex} - ${sanitize(context.sequenceName)}${extension}`;
  }

  let result = template;

  // Replace tokens
  const paddedIndex = String(context.index + 1).padStart(3, "0");
  result = result.replace(/\{index\}/g, paddedIndex);
  result = result.replace(/\{sequence\}/g, sanitize(context.sequenceName));
  result = result.replace(/\{clip\}/g, sanitize(context.clipName || context.sequenceName));

  // Ensure extension
  if (!result.toLowerCase().endsWith(extension.toLowerCase())) {
    result += extension;
  }

  return result;
};

// Generate preview filename with sample data
export const generatePreview = (template: string, extension: string = ".mp4"): string => {
  const sampleContext: FilenameContext = {
    index: 0,
    sequenceName: "My Sequence",
    clipName: "My Clip",
  };
  return generateFilename(template, sampleContext, extension);
};

// Sanitize filename segment - removes illegal characters
const sanitize = (value: string): string => {
  // Strip common extensions
  const extensions = [
    ".mov", ".mp4", ".mxf", ".avi", ".mkv", ".m4v", ".webm",
    ".wav", ".mp3", ".aac", ".aiff", ".m4a",
    ".prproj", ".psd", ".ai", ".png", ".jpg", ".jpeg", ".tif", ".tiff"
  ];

  let result = value;
  for (const ext of extensions) {
    if (result.toLowerCase().endsWith(ext)) {
      result = result.slice(0, -ext.length);
      break;
    }
  }

  // Remove illegal filename characters
  return result.replace(/[\\/:*?"<>|]/g, "_");
};

// Default template
export const DEFAULT_TEMPLATE = "{index} - {sequence}";
