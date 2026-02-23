import { useState, useEffect, useCallback, useRef } from "react";
import { evalTS } from "../../lib/utils/bolt";
import { QueueItem } from "../App";

export interface SavedQueue {
  id: string;
  name: string;
  timestamp: string;
  items: QueueItem[];
}

const SAVED_QUEUES_KEY = "com.exporter.claude.savedQueues";
const MAX_SAVED_QUEUES = 20;

const formatTimestamp = (): string => {
  const now = new Date();
  return now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const useSavedQueues = () => {
  const [savedQueues, setSavedQueues] = useState<SavedQueue[]>([]);
  const projectKeyRef = useRef<string>("");

  // Load saved queues for current project on mount
  useEffect(() => {
    const init = async () => {
      try {
        const result = (await evalTS("claude_getProjectName")) as any;
        const key = result?.name || "default";
        projectKeyRef.current = key;

        if (key === "default") {
          setTimeout(async () => {
            try {
              const retry = (await evalTS("claude_getProjectName")) as any;
              const retryKey = retry?.name || "default";
              if (retryKey !== "default") {
                projectKeyRef.current = retryKey;
                loadFromStorage(retryKey);
              }
            } catch { /* silent */ }
          }, 2000);
          return;
        }

        loadFromStorage(key);
      } catch (e) {
        console.error("Failed to init saved queues:", e);
      }
    };
    init();
  }, []);

  const loadFromStorage = (key: string) => {
    try {
      const stored = localStorage.getItem(SAVED_QUEUES_KEY);
      if (stored) {
        const all = JSON.parse(stored) as Record<string, SavedQueue[]>;
        setSavedQueues(all[key] || []);
      }
    } catch (e) {
      console.error("Failed to load saved queues:", e);
    }
  };

  const persistToStorage = (queues: SavedQueue[]) => {
    if (!projectKeyRef.current) return;
    try {
      const stored = localStorage.getItem(SAVED_QUEUES_KEY);
      const all = stored ? (JSON.parse(stored) as Record<string, SavedQueue[]>) : {};

      if (queues.length > 0) {
        all[projectKeyRef.current] = queues;
      } else {
        delete all[projectKeyRef.current];
      }

      if (Object.keys(all).length > 0) {
        localStorage.setItem(SAVED_QUEUES_KEY, JSON.stringify(all));
      } else {
        localStorage.removeItem(SAVED_QUEUES_KEY);
      }
    } catch (e) {
      console.error("Failed to persist saved queues:", e);
    }
  };

  const saveCurrentQueue = useCallback((items: QueueItem[]) => {
    const pendingItems = items.filter((item) => item.status === "pending");
    if (pendingItems.length === 0) return;

    // Strip trackVisibility to save space
    const stripped = pendingItems.map(({ trackVisibility, ...rest }) => ({
      ...rest,
      status: "pending" as const,
    }));

    const entry: SavedQueue = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Queue - ${formatTimestamp()}`,
      timestamp: new Date().toISOString(),
      items: stripped,
    };

    setSavedQueues((prev) => {
      const updated = [entry, ...prev].slice(0, MAX_SAVED_QUEUES);
      persistToStorage(updated);
      return updated;
    });
  }, []);

  const deleteQueue = useCallback((id: string) => {
    setSavedQueues((prev) => {
      const updated = prev.filter((q) => q.id !== id);
      persistToStorage(updated);
      return updated;
    });
  }, []);

  const clearSavedQueues = useCallback(() => {
    setSavedQueues([]);
    persistToStorage([]);
  }, []);

  return { savedQueues, saveCurrentQueue, deleteQueue, clearSavedQueues };
};
