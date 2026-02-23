import { fs, path, os, crypto, https } from "../../lib/cep/node";

const LEMONSQUEEZY_STORE_ID = 280959;
const LEMONSQUEEZY_PRODUCT_ID = 848753;
const OFFLINE_GRACE_DAYS = 3;

export interface LicenseData {
  licenseKey: string;
  instanceId: string;
  status: string;
  customerEmail?: string;
  lastValidatedOnline: string;
}

let _apiInProgress = false;

function getLicenseDir(): string {
  const home = os.homedir();
  if (os.platform() === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Exporter");
  }
  return path.join(home, "Library", "Application Support", "Exporter");
}

function getLicenseFilePath(): string {
  return path.join(getLicenseDir(), "license.json");
}

function ensureLicenseDir(): void {
  const dir = getLicenseDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readLicenseFromDisk(): LicenseData | null {
  try {
    const filePath = getLicenseFilePath();
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    if (!data.licenseKey || !data.instanceId) return null;
    return data as LicenseData;
  } catch {
    return null;
  }
}

function writeLicenseToDisk(data: LicenseData): boolean {
  try {
    ensureLicenseDir();
    fs.writeFileSync(getLicenseFilePath(), JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("Failed to save license:", e);
    return false;
  }
}

function clearLicenseFromDisk(): void {
  try {
    const filePath = getLicenseFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Best effort
  }
}

function getDeviceId(): string {
  try {
    const hostname = os.hostname() || "unknown";
    return crypto.createHash("sha256").update(hostname).digest("hex").substring(0, 32);
  } catch {
    return "unknown-device";
  }
}

function makeApiRequest(endpoint: string, body: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: "api.lemonsqueezy.com",
      port: 443,
      path: `/v1/licenses/${endpoint}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res: any) => {
      let responseData = "";
      res.on("data", (chunk: string) => {
        responseData += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(responseData));
        } catch {
          reject(new Error("Failed to parse API response"));
        }
      });
    });

    req.on("error", (e: Error) => reject(e));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    req.write(postData);
    req.end();
  });
}

export async function activateLicense(
  licenseKey: string
): Promise<{ success: boolean; error?: string }> {
  if (!licenseKey || typeof licenseKey !== "string" || licenseKey.trim().length === 0) {
    return { success: false, error: "Please enter a valid license key" };
  }

  if (_apiInProgress) {
    return { success: false, error: "Another operation in progress. Please wait." };
  }
  _apiInProgress = true;

  try {
    const instanceName = "Exporter-" + getDeviceId().substring(0, 8);
    const response = await makeApiRequest("activate", {
      license_key: licenseKey.trim(),
      instance_name: instanceName,
    });

    if (response.activated) {
      if (!response.instance || !response.instance.id) {
        return { success: false, error: "Invalid API response - missing instance data" };
      }
      if (!response.license_key || !response.license_key.status) {
        return { success: false, error: "Invalid API response - missing license data" };
      }

      // Verify store/product IDs if configured
      if (typeof LEMONSQUEEZY_STORE_ID === "number" && LEMONSQUEEZY_STORE_ID > 0) {
        if (response.meta && response.meta.store_id !== LEMONSQUEEZY_STORE_ID) {
          return { success: false, error: "This license key is not valid for this product" };
        }
      }

      const licenseData: LicenseData = {
        licenseKey: licenseKey.trim(),
        instanceId: response.instance.id,
        status: response.license_key.status,
        customerEmail: response.meta?.customer_email || undefined,
        lastValidatedOnline: new Date().toISOString(),
      };

      writeLicenseToDisk(licenseData);
      return { success: true };
    } else {
      let msg = response.error || "Activation failed";
      if (msg.toLowerCase().includes("limit")) {
        msg = "This license is already activated on another device. Please deactivate it first.";
      }
      return { success: false, error: msg };
    }
  } catch (e: any) {
    return { success: false, error: e.message || "Network error" };
  } finally {
    _apiInProgress = false;
  }
}

export async function validateLicense(): Promise<{
  valid: boolean;
  status: string;
  error?: string;
}> {
  const local = readLicenseFromDisk();
  if (!local) {
    return { valid: false, status: "none" };
  }

  if (_apiInProgress) {
    // If API call in progress, trust local data
    return { valid: local.status === "active", status: local.status };
  }
  _apiInProgress = true;

  try {
    const response = await makeApiRequest("validate", {
      license_key: local.licenseKey,
      instance_id: local.instanceId,
    });

    if (response.valid) {
      // Verify store/product IDs only when meta is present
      if (
        typeof LEMONSQUEEZY_STORE_ID === "number" &&
        LEMONSQUEEZY_STORE_ID > 0 &&
        response.meta
      ) {
        if (response.meta.store_id !== LEMONSQUEEZY_STORE_ID) {
          clearLicenseFromDisk();
          return { valid: false, status: "invalid", error: "License not valid for this product" };
        }
      }

      // Update local data with fresh validation timestamp
      const updatedData: LicenseData = {
        ...local,
        status: response.license_key?.status || local.status,
        lastValidatedOnline: new Date().toISOString(),
      };
      writeLicenseToDisk(updatedData);
      return { valid: true, status: updatedData.status };
    }

    // CRITICAL: Only clear on explicit 'disabled' status
    const status = response.license_key?.status || "unknown";
    if (status === "disabled") {
      clearLicenseFromDisk();
      return { valid: false, status: "disabled", error: "License has been disabled" };
    }

    // For all other cases, keep local license intact
    return { valid: local.status === "active", status: local.status };
  } catch {
    // Network error - use offline grace period
    return checkOfflineGrace(local);
  } finally {
    _apiInProgress = false;
  }
}

export async function deactivateLicense(): Promise<{ success: boolean; error?: string }> {
  const local = readLicenseFromDisk();
  if (!local) {
    return { success: true };
  }

  if (_apiInProgress) {
    return { success: false, error: "Another operation in progress. Please wait." };
  }
  _apiInProgress = true;

  try {
    const response = await makeApiRequest("deactivate", {
      license_key: local.licenseKey,
      instance_id: local.instanceId,
    });

    if (response.deactivated) {
      clearLicenseFromDisk();
      return { success: true };
    }

    // Handle "instance not found" (already deactivated elsewhere)
    const errorMsg = response.error || "";
    if (errorMsg.toLowerCase().includes("instance") && errorMsg.toLowerCase().includes("not found")) {
      clearLicenseFromDisk();
      return { success: true };
    }

    // Unknown error - do NOT clear local data
    return { success: false, error: errorMsg || "Deactivation failed" };
  } catch (e: any) {
    return { success: false, error: "Could not reach server. Try again." };
  } finally {
    _apiInProgress = false;
  }
}

function checkOfflineGrace(local: LicenseData): {
  valid: boolean;
  status: string;
  error?: string;
} {
  const gracePeriodMs = OFFLINE_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const lastOnline = local.lastValidatedOnline
    ? new Date(local.lastValidatedOnline).getTime()
    : 0;
  const offlineDuration = Date.now() - lastOnline;

  if (offlineDuration <= gracePeriodMs && local.status === "active") {
    return { valid: true, status: "active" };
  }

  return {
    valid: false,
    status: "offline_expired",
    error: "License requires online verification. Please connect to the internet.",
  };
}

export async function checkLicenseValidity(): Promise<{
  valid: boolean;
  needsActivation: boolean;
  status: string;
  error?: string;
}> {
  const local = readLicenseFromDisk();
  if (!local) {
    return { valid: false, needsActivation: true, status: "none" };
  }

  const result = await validateLicense();
  return {
    valid: result.valid,
    needsActivation: !result.valid,
    status: result.status,
    error: result.error,
  };
}
