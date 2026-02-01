import { useState, useEffect, useCallback } from "react";
import { PresetAssignment } from "../App";

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
  exportType: "clips" | "sequences";
  exportMethod: "direct" | "ame";
  filenamePattern: "seq_clip" | "seq_date" | "clip_only" | "custom";
  customFilename: string;
}

const STORAGE_KEY = "com.exporter.claude.settings";

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
  filenamePattern: "seq_clip",
  customFilename: "",
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

  const updateSettings = useCallback((updates: Partial<ExporterSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { settings, updateSettings, resetSettings };
};
