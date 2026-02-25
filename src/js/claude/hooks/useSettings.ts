import { useState, useEffect, useCallback, useRef } from "react";
import { PresetAssignment } from "../App";
import { evalTS } from "../../lib/utils/bolt";
import { os, path } from "../../lib/cep/node";

export interface ExporterSettings {
  presets: {
    slot1: PresetAssignment | null;
    slot2: PresetAssignment | null;
    slot3: PresetAssignment | null;
    slot4: PresetAssignment | null;
    slot5: PresetAssignment | null;
  };
  outputDirectory: string;
  recentDirectories: string[];
  exportType: "clips" | "sequences" | "markers";
  exportMethod: "direct" | "ame";
  filenameTemplate: string;
  logEnabled: boolean;
  logDirectory: string;
  exportCutsJson: boolean;
  markerSubMode: "video" | "stills";
  markerSecondsBefore: number;
  markerSecondsAfter: number;
  markerColorFilter: number[];
}

const STORAGE_KEY = "com.exporter.claude.settings";

const DEFAULT_LOG_DIRECTORY = os.homedir
  ? path.join(os.homedir(), "Documents", "Exporter Logs")
  : "";

const DEFAULT_SETTINGS: ExporterSettings = {
  presets: {
    slot1: null,
    slot2: null,
    slot3: null,
    slot4: null,
    slot5: null,
  },
  outputDirectory: "",
  recentDirectories: [],
  exportType: "clips",
  exportMethod: "direct",
  filenameTemplate: "{index} - {sequence}",
  logEnabled: true,
  logDirectory: DEFAULT_LOG_DIRECTORY,
  exportCutsJson: false,
  markerSubMode: "video",
  markerSecondsBefore: 5,
  markerSecondsAfter: 5,
  markerColorFilter: [],
};

export const useSettings = () => {
  const [settings, setSettings] = useState<ExporterSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  }, [settings]);

  // Validate preset paths on mount (re-resolve broken paths after Premiere updates)
  const hasValidatedRef = useRef(false);

  useEffect(() => {
    if (hasValidatedRef.current) return;
    hasValidatedRef.current = true;

    const validatePresets = async () => {
      const slots = ["slot1", "slot2", "slot3", "slot4", "slot5"] as const;
      let needsUpdate = false;
      const updatedPresets = { ...settings.presets };

      for (const slot of slots) {
        const preset = updatedPresets[slot];
        if (!preset || !preset.path) continue;

        try {
          const result = (await evalTS("claude_validatePresetPath", {
            presetName: preset.name,
            presetPath: preset.path,
          })) as any;

          if (result && !result.valid && result.resolved && result.path) {
            updatedPresets[slot] = { ...preset, path: result.path };
            needsUpdate = true;
          }
        } catch {
          // Non-fatal
        }
      }

      if (needsUpdate) {
        setSettings((prev) => ({ ...prev, presets: updatedPresets }));
      }
    };

    // Delay to ensure ExtendScript is loaded
    const timer = setTimeout(validatePresets, 1500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSettings = useCallback((updates: Partial<ExporterSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { settings, updateSettings, resetSettings };
};
