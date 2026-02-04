import { useState, useCallback } from "react";
import { evalTS } from "../../lib/utils/bolt";
import { PresetAssignment, QueueItem, LogMessage } from "../App";
import { ExporterSettings } from "./useSettings";
import { fs, path, child_process } from "../../lib/cep/node";
import { generateFilename, FilenameContext } from "../utils/filenameTokens";

// Fixed log directory for CSV exports
const LOG_DIRECTORY = "/Users/jakedahm/Library/Mobile Documents/com~apple~CloudDocs/Temp/Exporter Logs";

// Open a folder in Finder (macOS)
const openInFinder = (folderPath: string) => {
  try {
    child_process.exec(`open "${folderPath}"`);
  } catch (error) {
    console.error("Failed to open folder:", error);
  }
};

// Get project base name (strips date prefix and extension)
const getProjectBaseName = async (): Promise<string> => {
  try {
    const result = (await evalTS("claude_getProjectName")) as any;
    if (!result || !result.name) return "export";

    // Remove .prproj extension
    let name = result.name.replace(/\.prproj$/i, "");
    // Remove leading date pattern (XX_XX_XX-)
    name = name.replace(/^\d{2}_\d{2}_\d{2}-/, "");
    return name || "export";
  } catch {
    return "export";
  }
};

// Format log filename: 02_04_26 - 8:03AM - project-name.csv
const formatLogFilename = (projectName: string): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);
  const date = `${month}_${day}_${year}`;

  const hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  const time = `${hour12}:${minutes}${ampm}`;

  return `${date} - ${time} - ${projectName}.csv`;
};

// Export result with file info for logging
interface ExportResult {
  filename: string;
  outputPath: string;
  sequenceName: string;
  directory: string;
  clipDurationSeconds: number;
  exportDurationSeconds: number;
  fileSize: number;
  status: "success" | "failed";
}

interface ExportSummary {
  totalItems: number;
  successCount: number;
  failedCount: number;
  totalDurationSeconds: number;
  totalSizeBytes: number;
  outputDirectory: string;
}

interface UseQueueOptions {
  settings: ExporterSettings;
  addLog: (type: LogMessage["type"], message: string) => void;
  setIsExporting: (value: boolean) => void;
  setExportProgress: (value: number) => void;
  setStatusMessage: (value: string) => void;
  onExportComplete?: (summary: ExportSummary) => void;
}

interface ClipInfo {
  name: string;
  startTicks: number;
  endTicks: number;
}

interface SequenceInfo {
  sequenceName: string;
  clips?: ClipInfo[];
}

// Detect extension from preset path/name
const detectExtension = (presetPath: string): string => {
  if (!presetPath) return ".mp4";
  const lower = presetPath.toLowerCase();

  // QuickTime/ProRes → .mov
  if (lower.includes("quicktime") || lower.includes("prores") || lower.includes("apple prores")) {
    return ".mov";
  }
  // DNxHD/DNxHR → .mxf
  if (lower.includes("dnxhd") || lower.includes("dnxhr") || lower.includes("dnx")) {
    return ".mxf";
  }
  // MXF format
  if (lower.includes("mxf")) return ".mxf";
  // AVI
  if (lower.includes("avi")) return ".avi";
  // HEVC/H.265
  if (lower.includes("hevc") || lower.includes("h.265") || lower.includes("h265")) return ".mp4";
  // H.264/AVC
  if (lower.includes("h.264") || lower.includes("h264") || lower.includes("avc")) return ".mp4";
  // MP4 explicit
  if (lower.includes("mp4")) return ".mp4";
  // MOV explicit
  if (lower.includes("mov")) return ".mov";
  // CineForm/GoPro
  if (lower.includes("cineform") || lower.includes("gopro")) return ".mov";

  return ".mp4";
};

// Strip common video/audio extensions from a name
const stripExtension = (name: string): string => {
  const extensions = [
    ".mov", ".mp4", ".mxf", ".avi", ".mkv", ".m4v", ".webm",
    ".wav", ".mp3", ".aac", ".aiff", ".m4a",
    ".prproj", ".psd", ".ai", ".png", ".jpg", ".jpeg", ".tif", ".tiff"
  ];

  let result = name;
  for (const ext of extensions) {
    if (result.toLowerCase().endsWith(ext)) {
      result = result.slice(0, -ext.length);
      break;
    }
  }
  return result;
};

// Sanitize filename segment - removes illegal characters and strips extensions
const sanitizeSegment = (value: string): string => {
  const withoutExt = stripExtension(value);
  return withoutExt.replace(/[\\/:*?"<>|]/g, "_");
};

// Build filename using template
const buildFilename = (
  template: string,
  sequenceName: string,
  clipName: string | undefined,
  clipIndex: number,
  extension: string = ".mp4"
): string => {
  const context: FilenameContext = {
    index: clipIndex,
    sequenceName: sequenceName,
    clipName: clipName,
  };
  return generateFilename(template, context, extension);
};

// Format seconds to HH:MM:SS
const formatDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

// Format bytes to human readable
const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(2)} ${units[i]}`;
};

// Ensure log directory exists
const ensureLogDirectory = (): boolean => {
  try {
    if (!fs.existsSync(LOG_DIRECTORY)) {
      fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
    }
    return true;
  } catch (e) {
    console.error("Failed to create log directory:", e);
    return false;
  }
};

// Write/update CSV export log (called after each item completes)
const writeExportLog = (
  logPath: string,
  results: ExportResult[],
  outputDir: string
): boolean => {
  if (!results.length) return false;

  const now = new Date();

  // Calculate totals
  const successResults = results.filter((r) => r.status === "success");
  const totalClips = results.length;
  const successCount = successResults.length;
  const failedCount = results.length - successCount;
  const totalSize = successResults.reduce((sum, r) => sum + (r.fileSize || 0), 0);
  const totalClipDuration = successResults.reduce((sum, r) => sum + (r.clipDurationSeconds || 0), 0);
  const totalExportDuration = results.reduce((sum, r) => sum + (r.exportDurationSeconds || 0), 0);

  // Build CSV content
  const lines: string[] = [];

  // Header info
  lines.push("EXPORT LOG");
  lines.push(`Date,${now.toLocaleString()}`);
  lines.push(`Output Directory,${outputDir}`);
  lines.push(`Total Clips,${totalClips}`);
  lines.push(`Successful,${successCount}`);
  lines.push(`Failed,${failedCount}`);
  lines.push(`Total Size,${formatFileSize(totalSize)}`);
  lines.push(`Total Clip Duration,${formatDuration(totalClipDuration)}`);
  lines.push(`Total Export Time,${formatDuration(totalExportDuration)}`);
  lines.push("");

  // Column headers
  lines.push("Index,Filename,Sequence,Directory,Clip Duration,Export Duration,Filesize,Status");

  // Data rows
  results.forEach((r, i) => {
    const row = [
      String(i + 1),
      `"${r.filename}"`,
      `"${r.sequenceName}"`,
      `"${r.directory}"`,
      formatDuration(r.clipDurationSeconds),
      formatDuration(r.exportDurationSeconds),
      formatFileSize(r.fileSize),
      r.status,
    ];
    lines.push(row.join(","));
  });

  const csvContent = lines.join("\n");

  try {
    fs.writeFileSync(logPath, csvContent, "utf8");
    return true;
  } catch (e) {
    console.error("Failed to write export log:", e);
    return false;
  }
};

export const useQueue = ({
  settings,
  addLog,
  setIsExporting,
  setExportProgress,
  setStatusMessage,
  onExportComplete,
}: UseQueueOptions) => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const addToQueue = useCallback(
    async (preset: PresetAssignment) => {
      if (!settings.outputDirectory) {
        addLog("error", "Please select an output directory first");
        return;
      }

      if (!preset.path) {
        addLog("error", "Preset path not available. Please reassign the preset.");
        return;
      }

      try {
        // Get current sequence/clip info from Premiere
        const result = await evalTS("claude_getQueueInfo", {
          exportType: settings.exportType,
        }) as any;

        if (result && result.error) {
          addLog("error", result.error);
          return;
        }

        if (!result || !result.items || result.items.length === 0) {
          addLog("warning", "No sequences or clips to add to queue");
          return;
        }

        const extension = detectExtension(preset.path);
        const newItems: QueueItem[] = result.items.map((item: any, index: number) => ({
          id: generateId(),
          sequenceName: item.sequenceName,
          clipName: item.clipName,
          clipIndex: item.clipIndex,
          startTicks: item.startTicks,
          endTicks: item.endTicks,
          preset,
          outputPath: settings.outputDirectory,
          expectedFilename: buildFilename(
            settings.filenameTemplate,
            item.sequenceName,
            item.clipName,
            item.clipIndex !== undefined ? item.clipIndex : index,
            extension
          ),
          status: "pending" as const,
        }));

        setQueue((prev) => [...prev, ...newItems]);
        addLog("success", `+${newItems.length} items`);
      } catch (error: any) {
        addLog("error", `Failed to add to queue: ${error?.message || error}`);
      }
    },
    [settings, addLog]
  );

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const exportAllDirect = useCallback(async () => {
    if (queue.length === 0) {
      addLog("warning", "Queue is empty");
      return;
    }

    setIsProcessing(true);
    setIsExporting(true);
    setStatusMessage("Exporting...");

    let completed = 0;
    let failed = 0;
    const exportResults: ExportResult[] = [];
    let outputDir = "";

    // Setup log file path at start (for incremental writing)
    let logPath = "";
    if (ensureLogDirectory()) {
      const projectName = await getProjectBaseName();
      const logFilename = formatLogFilename(projectName);
      logPath = path.join(LOG_DIRECTORY, logFilename);
    }

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status !== "pending") continue;

      outputDir = item.outputPath; // Track output directory for log file
      const directory = path.basename(item.outputPath); // Just the folder name

      setExportProgress(Math.round((i / queue.length) * 100));
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "exporting" } : q))
      );

      // Track export time
      const exportStartTime = Date.now();

      try {
        const payload = {
          sequenceName: item.sequenceName,
          clipName: item.clipName,
          clipIndex: item.clipIndex,
          startTicks: item.startTicks,
          endTicks: item.endTicks,
          presetPath: item.preset.path,
          outputPath: item.outputPath,
          expectedFilename: item.expectedFilename,
        };

        const result = (await evalTS("claude_exportQueueItem", payload)) as any;
        const exportDurationSeconds = (Date.now() - exportStartTime) / 1000;

        if (result && result.error) {
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: "failed" } : q))
          );
          failed++;
          addLog("warning", `Failed: ${item.clipName || item.sequenceName} - ${result.error}`);
          exportResults.push({
            filename: item.expectedFilename,
            outputPath: item.outputPath,
            sequenceName: item.sequenceName,
            directory,
            clipDurationSeconds: 0,
            exportDurationSeconds,
            fileSize: 0,
            status: "failed",
          });
        } else {
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: "completed" } : q))
          );
          completed++;
          exportResults.push({
            filename: result.filename || item.expectedFilename,
            outputPath: result.outputPath || item.outputPath,
            sequenceName: item.sequenceName,
            directory,
            clipDurationSeconds: result.durationSeconds || 0,
            exportDurationSeconds,
            fileSize: result.fileSize || 0,
            status: "success",
          });
        }
      } catch (error: any) {
        const exportDurationSeconds = (Date.now() - exportStartTime) / 1000;
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "failed" } : q))
        );
        failed++;
        exportResults.push({
          filename: item.expectedFilename,
          outputPath: item.outputPath,
          sequenceName: item.sequenceName,
          directory,
          clipDurationSeconds: 0,
          exportDurationSeconds,
          fileSize: 0,
          status: "failed",
        });
      }

      // Write/update log file after each item (real-time updates)
      if (logPath && outputDir && exportResults.length > 0) {
        writeExportLog(logPath, exportResults, outputDir);
      }
    }

    setExportProgress(100);
    setIsExporting(false);
    setIsProcessing(false);
    setStatusMessage("Ready");

    if (failed > 0) {
      addLog("warning", `Exported ${completed}, ${failed} failed`);
    } else {
      addLog("success", `Exported ${completed} items`);
    }

    // Calculate totals for history
    const successResults = exportResults.filter((r) => r.status === "success");
    const totalDuration = successResults.reduce((sum, r) => sum + (r.clipDurationSeconds || 0), 0);
    const totalSize = successResults.reduce((sum, r) => sum + (r.fileSize || 0), 0);

    // Add to export history
    if (onExportComplete && outputDir) {
      onExportComplete({
        totalItems: exportResults.length,
        successCount: completed,
        failedCount: failed,
        totalDurationSeconds: totalDuration,
        totalSizeBytes: totalSize,
        outputDirectory: outputDir,
      });
    }

    // Log file was written incrementally, just notify user
    if (logPath) {
      addLog("info", "Log saved");
    }

    // Collect unique output directories and open each in Finder
    const uniqueDirs = new Set<string>();
    exportResults.forEach((r) => {
      if (r.status === "success" && r.outputPath) {
        // Get directory from full file path
        const dir = path.dirname(r.outputPath);
        if (dir) uniqueDirs.add(dir);
      }
    });
    // If we only have the outputDir (not full paths), use that
    if (uniqueDirs.size === 0 && outputDir) {
      uniqueDirs.add(outputDir);
    }
    // Open each unique directory in Finder
    uniqueDirs.forEach((dir) => {
      openInFinder(dir);
    });

    // Clear completed items after a delay
    setTimeout(() => {
      setQueue((prev) => prev.filter((q) => q.status !== "completed"));
      setExportProgress(0);
    }, 2000);
  }, [queue, addLog, setIsExporting, setExportProgress, setStatusMessage]);

  const queueAllToAME = useCallback(async () => {
    if (queue.length === 0) {
      addLog("warning", "Queue is empty");
      return;
    }

    setIsProcessing(true);
    setIsExporting(true);
    setStatusMessage("Queuing to AME...");

    // Collect all items to send in a single batch
    const items = queue
      .filter((item) => item.status === "pending")
      .map((item) => ({
        sequenceName: item.sequenceName,
        clipName: item.clipName,
        clipIndex: item.clipIndex,
        startTicks: item.startTicks,
        endTicks: item.endTicks,
        presetPath: item.preset.path,
        outputPath: item.outputPath,
        expectedFilename: item.expectedFilename,
      }));

    try {
      const result = await evalTS("claude_queueBatchToAME", { items }) as any;

      if (result && result.error) {
        addLog("error", result.error);
      } else {
        const queued = result?.queued || items.length;
        addLog("success", `Queued ${queued} to AME`);

        // Mark all as completed
        setQueue((prev) =>
          prev.map((q) => (q.status === "pending" ? { ...q, status: "completed" } : q))
        );

        // Clear completed items after a delay
        setTimeout(() => {
          setQueue((prev) => prev.filter((q) => q.status !== "completed"));
        }, 2000);
      }
    } catch (error: any) {
      addLog("error", `Failed to queue to AME: ${error?.message || error}`);
    }

    setExportProgress(100);
    setIsExporting(false);
    setIsProcessing(false);
    setStatusMessage("Ready");
    setTimeout(() => setExportProgress(0), 1000);
  }, [queue, addLog, setIsExporting, setExportProgress, setStatusMessage]);

  return {
    queue,
    addToQueue,
    removeFromQueue,
    clearQueue,
    exportAllDirect,
    queueAllToAME,
    isProcessing,
  };
};
