import { useState, useEffect, useCallback } from "react";

export interface ExportHistoryEntry {
  id: string;
  timestamp: string;
  totalItems: number;
  successCount: number;
  failedCount: number;
  totalDurationSeconds: number;
  totalSizeBytes: number;
  outputDirectory: string;
}

const HISTORY_KEY = "com.exporter.claude.history";
const MAX_HISTORY_ENTRIES = 50;

export const useExportHistory = () => {
  const [history, setHistory] = useState<ExportHistoryEntry[]>(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error("Failed to load export history:", e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      console.error("Failed to save export history:", e);
    }
  }, [history]);

  const addHistoryEntry = useCallback((entry: Omit<ExportHistoryEntry, "id" | "timestamp">) => {
    const newEntry: ExportHistoryEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };
    setHistory((prev) => [newEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  }, []);

  return { history, addHistoryEntry, clearHistory };
};
