import { useState, useEffect, useCallback, useRef } from "react";
import { checkForUpdate, UpdateInfo } from "../services/updateChecker";

export interface UseUpdateCheckerReturn {
  updateAvailable: UpdateInfo | null;
  dismissUpdate: () => void;
}

export const useUpdateChecker = (enabled: boolean): UseUpdateCheckerReturn => {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!enabled || checkedRef.current) return;
    checkedRef.current = true;

    checkForUpdate()
      .then((info) => {
        if (info) setUpdateAvailable(info);
      })
      .catch(() => {
        // Silent failure
      });
  }, [enabled]);

  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(null);
  }, []);

  return { updateAvailable, dismissUpdate };
};
