import { useState, useCallback } from "react";
import { evalTS } from "../../lib/utils/bolt";
import { PresetAssignment, QueueItem, LogMessage } from "../App";
import { ExporterSettings } from "./useSettings";

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

// Sanitize filename segment
const sanitizeSegment = (value: string): string => {
  return value.replace(/[\\/:*?"<>|]/g, "_");
};

// Build filename from pattern
const buildFilename = (
  pattern: ExporterSettings["filenamePattern"],
  customFilename: string,
  sequenceName: string,
  clipName?: string,
  clipIndex?: number,
  extension: string = ".mp4"
): string => {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const seqSafe = sanitizeSegment(sequenceName);
  const clipSafe = clipName ? sanitizeSegment(clipName) : "";
  const indexStr = clipIndex !== undefined ? String(clipIndex + 1) : "1";

  let result = "";

  if (pattern === "seq_date") {
    result = `${seqSafe}_${dateStr}`;
  } else if (pattern === "clip_only") {
    result = clipSafe ? `${clipSafe}_${indexStr}` : `${seqSafe}_${indexStr}`;
  } else if (pattern === "custom" && customFilename) {
    result = customFilename
      .replace(/\{seq\}/g, seqSafe)
      .replace(/\{clip\}/g, clipSafe)
      .replace(/\{i\}/g, indexStr)
      .replace(/\{date\}/g, dateStr);
  } else {
    // Default: seq_clip
    result = seqSafe;
    if (clipSafe) {
      result = `${result}_${clipSafe}`;
    }
    result = `${result}_${indexStr}`;
  }

  // Clean up double underscores and trim
  result = result.replace(/_+/g, "_").replace(/^_|_$/g, "");

  return (result || "export") + extension;
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
            settings.filenamePattern,
            settings.customFilename,
            item.sequenceName,
            item.clipName,
            item.clipIndex,
            extension
          ),
          status: "pending" as const,
        }));

        setQueue((prev) => [...prev, ...newItems]);
        addLog("success", `Added ${newItems.length} item(s) to queue`);
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
    addLog("info", "Queue cleared");
  }, [addLog]);

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

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status !== "pending") continue;

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
          filenamePattern: settings.filenamePattern,
          customFilename: settings.customFilename,
        };

        const result = await evalTS("claude_exportQueueItem", payload) as any;

        if (result && result.error) {
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: "failed" } : q))
          );
          failed++;
          addLog("warning", `Failed: ${item.clipName || item.sequenceName} - ${result.error}`);
        } else {
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: "completed" } : q))
          );
          completed++;
        }
      } catch (error: any) {
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "failed" } : q))
        );
        failed++;
      }
    }

    setExportProgress(100);
    setIsExporting(false);
    setIsProcessing(false);
    setStatusMessage("Ready");

    addLog("success", `Direct export complete: ${completed} succeeded, ${failed} failed`);

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
        filenamePattern: settings.filenamePattern,
        customFilename: settings.customFilename,
      }));

    try {
      const result = await evalTS("claude_queueBatchToAME", { items }) as any;

      if (result && result.error) {
        addLog("error", result.error);
      } else {
        const queued = result?.queued || items.length;
        addLog("success", `Queued ${queued} item(s) to Media Encoder`);

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
