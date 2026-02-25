import { https } from "../../lib/cep/node";
import { version as currentVersion } from "../../../shared/shared";

const GITHUB_OWNER = "jakecdahm";
const GITHUB_REPO = "exporter";
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_KEY = "com.exporter.claude.lastUpdateCheck";

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes?: string;
}

function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, "").split(".").map(Number);
  const partsB = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function fetchGitHubRelease(): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      method: "GET",
      headers: {
        "User-Agent": "Exporter-CEP",
        Accept: "application/vnd.github.v3+json",
      },
    };

    const req = https.get(options, (res: any) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        reject(new Error("Redirect not followed"));
        return;
      }
      if (res.statusCode === 404) {
        reject(new Error("No releases found"));
        return;
      }

      let data = "";
      res.on("data", (chunk: string) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Failed to parse GitHub response"));
        }
      });
    });

    req.on("error", (e: Error) => reject(e));
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  // Check cache
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.timestamp && Date.now() - parsed.timestamp < UPDATE_CHECK_INTERVAL_MS) {
        // Return cached result
        if (parsed.latestVersion && compareVersions(currentVersion, parsed.latestVersion) < 0) {
          return {
            currentVersion,
            latestVersion: parsed.latestVersion,
            downloadUrl: parsed.downloadUrl || "",
            releaseNotes: parsed.releaseNotes,
          };
        }
        return null;
      }
    }
  } catch {
    // Cache read failed, proceed with fresh check
  }

  try {
    const release = await fetchGitHubRelease();
    const latestVersion = (release.tag_name || "").replace(/^v/, "");
    const downloadUrl = release.html_url || "";
    const releaseNotes = release.body || "";

    // Cache the result
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          latestVersion,
          downloadUrl,
          releaseNotes,
        })
      );
    } catch {
      // Cache write failed, non-fatal
    }

    if (compareVersions(currentVersion, latestVersion) < 0) {
      return {
        currentVersion,
        latestVersion,
        downloadUrl,
        releaseNotes,
      };
    }

    return null;
  } catch {
    // Network error, no update info available
    return null;
  }
}
