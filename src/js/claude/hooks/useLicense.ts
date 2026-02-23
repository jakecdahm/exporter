import { useState, useEffect, useCallback, useRef } from "react";
import {
  checkLicenseValidity,
  activateLicense as activateApi,
  deactivateLicense as deactivateApi,
} from "../services/license";

export type LicenseStatus = "loading" | "valid" | "invalid" | "error";

export interface UseLicenseReturn {
  licenseStatus: LicenseStatus;
  activate: (key: string) => Promise<{ success: boolean; error?: string }>;
  deactivate: () => Promise<{ success: boolean; error?: string }>;
  recheck: () => void;
  isActivating: boolean;
}

export const useLicense = (): UseLicenseReturn => {
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>("loading");
  const [isActivating, setIsActivating] = useState(false);
  const checkedRef = useRef(false);

  const check = useCallback(async () => {
    setLicenseStatus("loading");
    try {
      const result = await checkLicenseValidity();
      setLicenseStatus(result.valid ? "valid" : "invalid");
    } catch {
      setLicenseStatus("error");
    }
  }, []);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    check();
  }, [check]);

  const activate = useCallback(
    async (key: string): Promise<{ success: boolean; error?: string }> => {
      setIsActivating(true);
      try {
        const result = await activateApi(key);
        if (result.success) {
          setLicenseStatus("valid");
        }
        return result;
      } catch (e: any) {
        return { success: false, error: e.message || "Activation failed" };
      } finally {
        setIsActivating(false);
      }
    },
    []
  );

  const deactivate = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsActivating(true);
    try {
      const result = await deactivateApi();
      if (result.success) {
        setLicenseStatus("invalid");
      }
      return result;
    } catch (e: any) {
      return { success: false, error: e.message || "Deactivation failed" };
    } finally {
      setIsActivating(false);
    }
  }, []);

  const recheck = useCallback(() => {
    checkedRef.current = false;
    check();
  }, [check]);

  return { licenseStatus, activate, deactivate, recheck, isActivating };
};
