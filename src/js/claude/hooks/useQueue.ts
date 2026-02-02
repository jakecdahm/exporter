import { useState, useCallback } from "react";
import { evalTS } from "../../lib/utils/bolt";
import { PresetAssignment, QueueItem, LogMessage } from "../App";
import { ExporterSettings } from "./useSettings";
import { fs, path } from "../../lib/cep/node";
import { generateFilename, FilenameContext } from "../utils/filenameTokens";

// Export result with file info for logging
interface ExportResult {
  filename: string;
  outputPath: string;
  sequenceName: string;
  clipName?: string;
  durationSeconds: number;
  fileSize: number;
  status: "success" | "failed";
  error?: string;
}

interface UseQueueOptions {
  settings: ExporterSettings;
  addLog: (type: LogMessage["type"], message: string) => void;
  setIsExporting: (value: boolean) => void;
  setExportProgress: (value: number) => void;
  setStatusMessage: (value: string) => void;
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

// Generate CSV export log
const generateExportLog = (results: ExportResult[], outputDir: string): string | null => {
  if (!results.length) return null;

  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
  const logFilename = `export_log_${timestamp}.csv`;
  const logPath = path.join(outputDir, logFilename);

  // Calculate totals
  const successResults = results.filter(r => r.status === "success");
  const totalClips = results.length;
  const successCount = successResults.length;
  const failedCount = results.length - successCount;
  const totalSize = successResults.reduce((sum, r) => sum + (r.fileSize || 0), 0);
  const totalDuration = successResults.reduce((sum, r) => sum + (r.durationSeconds || 0), 0);

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
  lines.push(`Total Duration,${formatDuration(totalDuration)}`);
  lines.push("");

  // Column headers
  lines.push("Index,Filename,Sequence,Clip,Duration,File Size,Status,Error");

  // Data rows
  results.forEach((r, i) => {
    const row = [
      String(i + 1),
      `"${r.filename}"`,
      `"${r.sequenceName}"`,
      `"${r.clipName || ""}"`,
      formatDuration(r.durationSeconds),
      formatFileSize(r.fileSize),
      r.status,
      `"${r.error || ""}"`
    ];
    lines.push(row.join(","));
  });

  const csvContent = lines.join("\n");

  try {
    fs.writeFileSync(logPath, csvContent, "utf8");
    return logPath;
  } catch (e) {
    console.error("Failed to write export log:", e);
    return null;
  }
};

export const useQueue = ({
  settings,
  addLog,
  setIsExporting,
  setExportProgress,
  setStatusMessage,
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

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status !== "pending") continue;

      outputDir = item.outputPath; // Track output directory for log file

      setExportProgress(Math.round((i / queue.length) * 100));
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "exporting" } : q))
      );

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

        const result = await evalTS("claude_exportQueueItem", payload) as any;

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
            clipName: item.clipName,
            durationSeconds: 0,
            fileSize: 0,
            status: "failed",
            error: result.error,
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
            clipName: item.clipName,
            durationSeconds: result.durationSeconds || 0,
            fileSize: result.fileSize || 0,
            status: "success",
          });
        }
      } catch (error: any) {
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "failed" } : q))
        );
        failed++;
        exportResults.push({
          filename: item.expectedFilename,
          outputPath: item.outputPath,
          sequenceName: item.sequenceName,
          clipName: item.clipName,
          durationSeconds: 0,
          fileSize: 0,
          status: "failed",
          error: error?.message || String(error),
        });
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

    // Generate export log CSV
    if (outputDir && exportResults.length > 0) {
      const logPath = generateExportLog(exportResults, outputDir);
      if (logPath) {
        addLog("info", "Log saved");
      }
    }

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
