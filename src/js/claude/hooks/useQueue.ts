import { useState, useCallback, useEffect, useRef } from "react";
import { evalTS } from "../../lib/utils/bolt";
import { PresetAssignment, QueueItem, TrackVisibility, LogMessage, STILL_EXPORT_PRESET } from "../App";
import { ExporterSettings } from "./useSettings";
import { fs, path, child_process } from "../../lib/cep/node";
import { generateFilename, FilenameContext } from "../utils/filenameTokens";

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
  const time = `${hour12}.${minutes}${ampm}`;

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
const ensureLogDirectory = (logDirectory: string): boolean => {
  try {
    if (!logDirectory) return false;
    if (!fs.existsSync(logDirectory)) {
      fs.mkdirSync(logDirectory, { recursive: true });
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

const QUEUE_STORAGE_KEY = "com.exporter.claude.queue";

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
  const [exportTrigger, setExportTrigger] = useState(false);
  const projectKeyRef = useRef<string>("");

  // Restore queue from localStorage for a given project key
  const restoreQueue = useCallback((key: string) => {
    try {
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        const allQueues = JSON.parse(stored) as Record<string, QueueItem[]>;
        const items = allQueues[key] || [];
        const restored = items
          .map((item: QueueItem) => ({
            ...item,
            status: item.status === "exporting" ? ("pending" as const) : item.status,
          }))
          .filter((item: QueueItem) => item.status === "pending");
        if (restored.length > 0) {
          setQueue(restored);
          addLog("info", `Restored ${restored.length} queued items`);
        }
      }
    } catch (e) {
      console.error("Failed to restore queue:", e);
    }
  }, [addLog]);

  // Load persisted queue on mount (needs async project name lookup)
  useEffect(() => {
    const init = async () => {
      try {
        const result = (await evalTS("claude_getProjectName")) as any;
        const key = result?.name || "default";
        projectKeyRef.current = key;

        if (key === "default") {
          // Project may not be ready yet, retry after delay
          setTimeout(async () => {
            try {
              const retry = (await evalTS("claude_getProjectName")) as any;
              const retryKey = retry?.name || "default";
              if (retryKey !== "default") {
                projectKeyRef.current = retryKey;
                restoreQueue(retryKey);
              }
            } catch { /* silent */ }
          }, 2000);
          return;
        }

        restoreQueue(key);
      } catch (e) {
        console.error("Failed to load persisted queue:", e);
      }
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist queue to localStorage whenever it changes (project-scoped)
  useEffect(() => {
    if (!projectKeyRef.current) return;
    try {
      const toSave = queue.filter((item) => item.status === "pending" || item.status === "exporting");
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      const allQueues = stored ? (JSON.parse(stored) as Record<string, QueueItem[]>) : {};

      if (toSave.length > 0) {
        allQueues[projectKeyRef.current] = toSave;
      } else {
        delete allQueues[projectKeyRef.current];
      }

      if (Object.keys(allQueues).length > 0) {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(allQueues));
      } else {
        localStorage.removeItem(QUEUE_STORAGE_KEY);
      }
    } catch (e) {
      console.error("Failed to persist queue:", e);
    }
  }, [queue]);

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const addToQueue = useCallback(
    async (preset: PresetAssignment): Promise<boolean> => {
      if (!settings.outputDirectory) {
        addLog("error", "Please select an output directory first");
        return false;
      }

      const isStillsMode = settings.exportType === "markers" && settings.markerSubMode === "stills";

      if (!isStillsMode && !preset.path) {
        addLog("error", "Preset path not available. Please reassign the preset.");
        return false;
      }

      try {
        let result: any;

        if (settings.exportType === "markers") {
          if (settings.markerSubMode === "video") {
            // Video mode: get marker positions with before/after durations
            result = await evalTS("claude_getMarkerQueueInfo", {
              secondsBefore: settings.markerSecondsBefore,
              secondsAfter: settings.markerSecondsAfter,
            });
          } else {
            // Stills mode: just need marker positions
            const markerResult = await evalTS("claude_getMarkerInfo", {}) as any;
            if (markerResult && markerResult.markers) {
              result = {
                items: markerResult.markers.map((m: any, i: number) => ({
                  sequenceName: markerResult.sequenceName,
                  markerName: m.name,
                  markerIndex: i,
                  markerTicks: m.ticks,
                  clipIndex: i,
                  colorIndex: m.colorIndex,
                })),
              };
            } else {
              result = markerResult; // Pass through error
            }
          }
        } else {
          // Existing clips/sequences logic
          result = await evalTS("claude_getQueueInfo", {
            exportType: settings.exportType,
          });
        }

        if (result && result.error) {
          addLog("error", result.error);
          return false;
        }

        if (!result || !result.items || result.items.length === 0) {
          addLog("warning", "No items to add to queue");
          return false;
        }

        // Filter markers by selected colors (empty array = no filter)
        if (settings.exportType === "markers" && settings.markerColorFilter && settings.markerColorFilter.length > 0 && settings.markerColorFilter.length < 8) {
          const allowedColors = settings.markerColorFilter;
          result.items = result.items.filter(
            (item: any) => allowedColors.includes(item.colorIndex)
          );
          if (result.items.length === 0) {
            addLog("warning", "No markers match the selected colors");
            return false;
          }
        }

        // Snapshot track visibility at queue time (skip for stills)
        let trackVisibility: TrackVisibility | undefined;
        if (!isStillsMode) {
          try {
            const visResult = await evalTS("claude_getTrackVisibility") as any;
            if (visResult && !visResult.error) {
              trackVisibility = {
                videoClips: visResult.videoClips,
                audioClips: visResult.audioClips,
                videoTrackMutes: visResult.videoTrackMutes,
                audioTrackMutes: visResult.audioTrackMutes,
              };
            }
          } catch {
            // Non-fatal
          }
        }

        const effectivePreset = isStillsMode ? STILL_EXPORT_PRESET : preset;
        const extension = isStillsMode ? ".jpg" : detectExtension(preset.path);

        const newItems: QueueItem[] = result.items.map((item: any, index: number) => {
          const context: FilenameContext = {
            index: item.clipIndex !== undefined ? item.clipIndex : index,
            sequenceName: item.sequenceName,
            clipName: item.clipName,
            markerName: item.markerName,
          };

          return {
            id: generateId(),
            sequenceName: item.sequenceName,
            clipName: item.clipName,
            clipIndex: item.clipIndex,
            startTicks: item.startTicks,
            endTicks: item.endTicks,
            preset: effectivePreset,
            outputPath: settings.outputDirectory,
            expectedFilename: generateFilename(settings.filenameTemplate, context, extension),
            useInOut: item.useInOut || settings.exportType === "markers",
            trackVisibility,
            status: "pending" as const,
            markerName: item.markerName,
            markerTicks: item.markerTicks,
            colorIndex: item.colorIndex,
            isStillExport: isStillsMode,
          };
        });

        setQueue((prev) => [...prev, ...newItems]);
        addLog("success", `+${newItems.length} items`);
        return true;
      } catch (error: any) {
        addLog("error", `Failed to add to queue: ${error?.message || error}`);
        return false;
      }
    },
    [settings, addLog]
  );

  const addStillsToQueue = useCallback(async (): Promise<boolean> => {
    return addToQueue(STILL_EXPORT_PRESET);
  }, [addToQueue]);

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

    let completed = 0;
    let failed = 0;
    const exportResults: ExportResult[] = [];
    let outputDir = "";
    const totalPending = queue.filter((q) => q.status === "pending").length;
    let currentItem = 0;

    setStatusMessage(`0/${totalPending}`);

    // Setup log file path at start (for incremental writing) - only if logging is enabled
    let logPath = "";
    if (settings.logEnabled && settings.logDirectory) {
      try {
        if (ensureLogDirectory(settings.logDirectory)) {
          const projectName = await getProjectBaseName();
          const logFilename = formatLogFilename(projectName);
          logPath = path.join(settings.logDirectory, logFilename);
        }
      } catch (logSetupError) {
        console.error("Failed to setup log path:", logSetupError);
        // Continue with export even if logging fails
      }
    }

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status !== "pending") continue;

      currentItem++;
      outputDir = item.outputPath; // Track output directory for log file
      // Get just the folder name for directory column
      let directory = item.outputPath;
      try {
        directory = path.basename(item.outputPath) || item.outputPath;
      } catch {
        // Use full path if basename fails
      }

      setStatusMessage(`${currentItem}/${totalPending}`);
      setExportProgress(Math.round((currentItem / totalPending) * 100));
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "exporting" } : q))
      );

      // Restore track visibility snapshot before exporting this item
      if (item.trackVisibility) {
        try {
          await evalTS("claude_setTrackVisibility", item.trackVisibility);
        } catch {
          // Non-fatal
        }
      }

      // Stills export path - export JPEG frame directly
      if (item.isStillExport && item.markerTicks !== undefined) {
        const exportStartTime = Date.now();
        try {
          const jpgPath = path.join(item.outputPath, item.expectedFilename);
          // exportFrameJPEG auto-appends .jpg, so pass path without extension
          const jpgPathNoExt = jpgPath.replace(/\.jpg$/i, "");
          const result = (await evalTS("claude_exportFrameJPEG", {
            timeTicks: item.markerTicks,
            outputFilePath: jpgPathNoExt,
          })) as any;
          const exportDurationSeconds = (Date.now() - exportStartTime) / 1000;

          if (result && result.error) {
            setQueue((prev) =>
              prev.map((q) => (q.id === item.id ? { ...q, status: "failed" } : q))
            );
            failed++;
            addLog("warning", `Failed: ${item.markerName || item.expectedFilename} - ${result.error}`);
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
              filename: item.expectedFilename,
              outputPath: jpgPath,
              sequenceName: item.sequenceName,
              directory,
              clipDurationSeconds: 0,
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

        // Write/update log file after each item
        try {
          if (logPath && outputDir && exportResults.length > 0) {
            writeExportLog(logPath, exportResults, outputDir);
          }
        } catch (logWriteError) {
          console.error("Failed to write export log:", logWriteError);
        }
        continue; // Skip the normal video export path
      }

      // Track export time
      const exportStartTime = Date.now();

      try {
        const payload = {
          sequenceName: item.sequenceName,
          clipName: item.clipName,
          clipIndex: item.clipIndex,
          startTicks: item.startTicks,
          endTicks: item.endTicks,
          useInOut: item.useInOut,
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

          // Write .cuts.json alongside the video if enabled
          if (settings.exportCutsJson) {
            try {
              const editPoints = await evalTS("claude_getEditPoints", {
                sequenceName: item.sequenceName,
                inPointTicks: item.startTicks,
                outPointTicks: item.endTicks,
              }) as any;

              if (editPoints && !editPoints.error && editPoints.cuts) {
                const videoFilePath = path.join(item.outputPath, result.filename || item.expectedFilename);
                const jsonPath = videoFilePath.replace(/\.[^.]+$/, ".cuts.json");
                const cutsData = {
                  sequence: item.sequenceName,
                  track: editPoints.trackName || "V1",
                  clipCount: editPoints.clipCount || 0,
                  cuts: editPoints.cuts,
                };
                fs.writeFileSync(jsonPath, JSON.stringify(cutsData, null, 2), "utf8");
              }
            } catch (cutsErr) {
              // Non-fatal: don't fail the export over cuts JSON
              addLog("warning", "Failed to write cuts JSON");
            }
          }
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
      try {
        if (logPath && outputDir && exportResults.length > 0) {
          writeExportLog(logPath, exportResults, outputDir);
        }
      } catch (logWriteError) {
        console.error("Failed to write export log:", logWriteError);
        // Continue with export even if logging fails
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

    // Final log write and notify user
    if (logPath && outputDir && exportResults.length > 0) {
      try {
        const wrote = writeExportLog(logPath, exportResults, outputDir);
        if (wrote) {
          addLog("info", "Log saved");
        } else {
          addLog("warning", "Failed to write log");
        }
      } catch (e: any) {
        addLog("warning", `Log write error: ${e?.message || e}`);
      }
    }

    // Collect unique output directories and open each in Finder
    const uniqueDirs = new Set<string>();
    try {
      exportResults.forEach((r) => {
        if (r.status === "success" && r.outputPath) {
          // Get directory from full file path
          const dir = path.dirname(r.outputPath);
          if (dir) uniqueDirs.add(dir);
        }
      });
    } catch {
      // Ignore path errors
    }
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
  }, [queue, settings.logEnabled, settings.logDirectory, settings.exportCutsJson, addLog, setIsExporting, setExportProgress, setStatusMessage, onExportComplete]);

  const queueAllToAME = useCallback(async () => {
    if (queue.length === 0) {
      addLog("warning", "Queue is empty");
      return;
    }

    setIsProcessing(true);
    setIsExporting(true);
    setStatusMessage("Queuing to AME...");

    // Separate stills from video items (stills can't go to AME)
    const allPending = queue.filter((item) => item.status === "pending");
    const stillItems = allPending.filter((item) => item.isStillExport);
    const pendingItems = allPending.filter((item) => !item.isStillExport);

    // Export stills directly (they bypass AME)
    if (stillItems.length > 0) {
      for (const item of stillItems) {
        if (item.markerTicks === undefined) continue;
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "exporting" } : q))
        );
        try {
          const jpgPath = path.join(item.outputPath, item.expectedFilename);
          // exportFrameJPEG auto-appends .jpg, so pass path without extension
          const jpgPathNoExt = jpgPath.replace(/\.jpg$/i, "");
          const result = (await evalTS("claude_exportFrameJPEG", {
            timeTicks: item.markerTicks,
            outputFilePath: jpgPathNoExt,
          })) as any;
          if (result && result.error) {
            setQueue((prev) =>
              prev.map((q) => (q.id === item.id ? { ...q, status: "failed" } : q))
            );
            addLog("warning", `Failed: ${item.markerName || item.expectedFilename} - ${result.error}`);
          } else {
            setQueue((prev) =>
              prev.map((q) => (q.id === item.id ? { ...q, status: "completed" } : q))
            );
          }
        } catch {
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: "failed" } : q))
          );
        }
      }
      if (stillItems.length > 0) {
        addLog("success", `Exported ${stillItems.length} stills`);
      }
    }

    // Group remaining video items by track visibility so each group gets the right state
    const groups: { visibility: TrackVisibility | undefined; items: typeof pendingItems }[] = [];
    for (const item of pendingItems) {
      const key = item.trackVisibility ? JSON.stringify(item.trackVisibility) : "";
      const existing = groups.find((g) =>
        (g.visibility ? JSON.stringify(g.visibility) : "") === key
      );
      if (existing) {
        existing.items.push(item);
      } else {
        groups.push({ visibility: item.trackVisibility, items: [item] });
      }
    }

    try {
      let totalQueued = 0;
      const allErrors: string[] = [];

      for (const group of groups) {
        // Restore track visibility for this group
        if (group.visibility) {
          try {
            await evalTS("claude_setTrackVisibility", group.visibility);
          } catch {
            // Non-fatal
          }
        }

        const items = group.items.map((item) => ({
          sequenceName: item.sequenceName,
          clipName: item.clipName,
          clipIndex: item.clipIndex,
          startTicks: item.startTicks,
          endTicks: item.endTicks,
          useInOut: item.useInOut,
          presetPath: item.preset.path,
          outputPath: item.outputPath,
          expectedFilename: item.expectedFilename,
        }));

        const result = await evalTS("claude_queueBatchToAME", { items }) as any;

        if (result && result.error) {
          allErrors.push(result.error);
        } else {
          totalQueued += result?.queued || items.length;

          // Write .cuts.json for each item if enabled
          if (settings.exportCutsJson) {
            for (const item of items) {
              try {
                const editPoints = await evalTS("claude_getEditPoints", {
                  sequenceName: item.sequenceName,
                  inPointTicks: item.startTicks,
                  outPointTicks: item.endTicks,
                }) as any;

                if (editPoints && !editPoints.error && editPoints.cuts) {
                  const videoFilePath = path.join(item.outputPath, item.expectedFilename);
                  const jsonPath = videoFilePath.replace(/\.[^.]+$/, ".cuts.json");
                  const cutsData = {
                    sequence: item.sequenceName,
                    track: editPoints.trackName || "V1",
                    clipCount: editPoints.clipCount || 0,
                    cuts: editPoints.cuts,
                  };
                  fs.writeFileSync(jsonPath, JSON.stringify(cutsData, null, 2), "utf8");
                }
              } catch {
                // Non-fatal
              }
            }
          }
        }
      }

      if (allErrors.length > 0) {
        addLog("error", allErrors.join("; "));
      }
      if (totalQueued > 0) {
        addLog("success", `Queued ${totalQueued} to AME`);
      }

      // Mark all as completed
      setQueue((prev) =>
        prev.map((q) => (q.status === "pending" ? { ...q, status: "completed" } : q))
      );

      // Clear completed items after a delay
      setTimeout(() => {
        setQueue((prev) => prev.filter((q) => q.status !== "completed"));
      }, 2000);
    } catch (error: any) {
      addLog("error", `Failed to queue to AME: ${error?.message || error}`);
    }

    setExportProgress(100);
    setIsExporting(false);
    setIsProcessing(false);
    setStatusMessage("Ready");
    setTimeout(() => setExportProgress(0), 1000);
  }, [queue, settings.exportCutsJson, addLog, setIsExporting, setExportProgress, setStatusMessage]);

  // Auto-export trigger: fires after addAndExport adds items to queue
  useEffect(() => {
    if (!exportTrigger || isProcessing) return;
    if (!queue.some((q) => q.status === "pending")) {
      setExportTrigger(false);
      return;
    }
    setExportTrigger(false);
    if (settings.exportMethod === "direct") {
      exportAllDirect();
    } else {
      queueAllToAME();
    }
  }, [exportTrigger, queue, isProcessing, settings.exportMethod, exportAllDirect, queueAllToAME]);

  const addAndExport = useCallback(
    async (preset: PresetAssignment) => {
      const added = await addToQueue(preset);
      if (added) {
        setExportTrigger(true);
      }
    },
    [addToQueue]
  );

  const loadSavedQueueItems = useCallback((items: QueueItem[]) => {
    const loaded = items.map((item) => ({
      ...item,
      id: generateId(),
      status: "pending" as const,
    }));
    setQueue((prev) => [...prev, ...loaded]);
    addLog("info", `Loaded ${loaded.length} items from saved queue`);
  }, [addLog]);

  return {
    queue,
    addToQueue,
    addAndExport,
    addStillsToQueue,
    removeFromQueue,
    clearQueue,
    exportAllDirect,
    queueAllToAME,
    isProcessing,
    loadSavedQueueItems,
  };
};
