import { useState, useCallback, useEffect } from "react";
import { evalTS } from "../../lib/utils/bolt";
import { PresetAssignment, PresetInfo, LogMessage } from "../App";
import { ExporterSettings } from "./useSettings";

interface UseExportOptions {
  settings: ExporterSettings;
  addLog: (type: LogMessage["type"], message: string) => void;
  setIsExporting: (value: boolean) => void;
  setExportProgress: (value: number) => void;
  setStatusMessage: (value: string) => void;
}

interface ExportResult {
  queued?: number;
  clips?: number;
  error?: string;
  errors?: string[];
}

export const useExport = ({
  settings,
  addLog,
  setIsExporting,
  setExportProgress,
  setStatusMessage,
}: UseExportOptions) => {
  const [availablePresets, setAvailablePresets] = useState<PresetInfo[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  const loadPresets = useCallback(async (retryCount = 0): Promise<void> => {
    try {
      addLog("info", "Loading presets...");
      setStatusMessage("Loading presets...");

      // Load both system presets and user presets in parallel
      const [systemResult, userResult] = await Promise.all([
        evalTS("claude_getAvailablePresets"),
        evalTS("claude_scanUserPresets"),
      ]);

      if (systemResult && "error" in systemResult) {
        const errorMsg = systemResult.error as string;
        // If namespace not available and we haven't retried too many times, wait and retry
        if (errorMsg.includes("namespace not available") && retryCount < 5) {
          addLog("info", "Waiting for ExtendScript to load...");
          await new Promise((resolve) => setTimeout(resolve, 500));
          return loadPresets(retryCount + 1);
        }
        addLog("error", errorMsg);
        setStatusMessage("Failed to load presets");
        return;
      }

      let allPresets: PresetInfo[] = [];

      // Add user presets first (they have actual file paths)
      if (userResult && "userPresets" in userResult && Array.isArray(userResult.userPresets)) {
        const userPresets = (userResult.userPresets as any[]).map((p) => ({
          name: `${p.name} (User)`,
          matchName: p.name,
          path: p.path,
          exporter: "User Preset",
        }));
        allPresets = [...userPresets];
        if (userPresets.length > 0) {
          addLog("info", `Found ${userPresets.length} user preset(s)`);
        }
      }

      // Add system presets
      if (systemResult && "presets" in systemResult && Array.isArray(systemResult.presets)) {
        allPresets = [...allPresets, ...(systemResult.presets as PresetInfo[])];
      }

      setAvailablePresets(allPresets);
      addLog("success", `Loaded ${allPresets.length} presets`);
      setStatusMessage("Ready");
      setIsInitialized(true);
    } catch (error: any) {
      const errorMsg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
      // Retry if namespace error
      if (errorMsg.includes("namespace not available") && retryCount < 5) {
        addLog("info", "Waiting for ExtendScript to load...");
        await new Promise((resolve) => setTimeout(resolve, 500));
        return loadPresets(retryCount + 1);
      }
      addLog("error", `Failed to load presets: ${errorMsg}`);
      setStatusMessage("Error loading presets");
    }
  }, [addLog, setStatusMessage]);

  // Presets are loaded on-demand via the refresh button in Header/PresetModal
  // This avoids auto-launching Media Encoder when the panel opens

  const handleExport = useCallback(
    async (preset: PresetAssignment) => {
      if (!settings.outputDirectory) {
        addLog("error", "Please select an output directory first");
        return;
      }

      if (!preset.path) {
        addLog("error", "Preset path not available. Please reassign the preset.");
        return;
      }

      setIsExporting(true);
      setExportProgress(0);
      setStatusMessage("Exporting...");

      try {
        const payload = {
          presetPath: preset.path,
          outputPath: settings.outputDirectory,
          exportSelectedClips: settings.exportSelectedClipsOnly,
        };

        let result: ExportResult;

        if (settings.exportSelectedClipsOnly) {
          // Export selected clips
          if (settings.exportMethod === "direct") {
            addLog("info", `Exporting selected clips directly with "${preset.displayName}"...`);
            result = await evalTS("claude_exportSelectedClipsDirect", payload);
          } else {
            addLog("info", `Queuing selected clips to AME with "${preset.displayName}"...`);
            result = await evalTS("claude_queueSelectedClips", payload);
          }
        } else {
          // Export full sequence
          if (settings.exportMethod === "direct") {
            addLog("info", `Exporting sequence directly with "${preset.displayName}"...`);
            result = await evalTS("claude_exportDirect", payload);
          } else {
            addLog("info", `Queuing sequence to AME with "${preset.displayName}"...`);
            result = await evalTS("claude_queueExport", payload);
          }
        }

        if (result && "error" in result) {
          addLog("error", result.error as string);
          setStatusMessage("Export failed");
        } else if (result && "queued" in result) {
          const count = result.queued || 0;
          const clipInfo = result.clips ? ` (${result.clips} clips)` : "";
          addLog("success", `Successfully ${settings.exportMethod === "direct" ? "exported" : "queued"} ${count} item(s)${clipInfo}`);

          // Log debug info only if there's an issue
          if ((result as any).debug) {
            const debug = (result as any).debug;
            if (!debug.presetExists) {
              addLog("warning", `Preset file not found: ${debug.presetPath || preset.displayName}`);
            }
            if (debug.error) {
              addLog("warning", `Encoder error: ${debug.error}`);
            }
          }

          if (result.errors && result.errors.length > 0) {
            result.errors.forEach((err) => addLog("warning", `Failed: ${err}`));
          }

          setStatusMessage("Ready");
        }

        setExportProgress(100);
      } catch (error) {
        addLog("error", `Export failed: ${error}`);
        setStatusMessage("Export failed");
      } finally {
        setIsExporting(false);
        setTimeout(() => setExportProgress(0), 1000);
      }
    },
    [settings, addLog, setIsExporting, setExportProgress, setStatusMessage]
  );

  return { handleExport, availablePresets, loadPresets };
};
