/* eslint-disable no-undef */
// Claude's ExtendScript implementation for Exporter
// Separate from Codex's ppro.ts - all functions prefixed with claude_

type ClaudePresetInfo = {
  name: string;
  matchName?: string;
  path?: string;
  exporter?: string;
};

type ClaudeQueuePayload = {
  presetPath?: string;
  outputPath?: string;
  extension?: string;
  exportSelectedClips?: boolean;
};

const CLAUDE_DEFAULT_EXTENSION = ".mp4";

// Detect output extension from preset path/name
const claude_detectExtension = (presetPath: string): string => {
  if (!presetPath) return CLAUDE_DEFAULT_EXTENSION;

  var lower = presetPath.toLowerCase();

  // Check for format indicators in path/name
  // QuickTime/ProRes → .mov
  if (lower.indexOf("quicktime") !== -1 || lower.indexOf("prores") !== -1 || lower.indexOf("apple prores") !== -1) {
    return ".mov";
  }
  // DNxHD/DNxHR → .mxf (commonly) or .mov
  if (lower.indexOf("dnxhd") !== -1 || lower.indexOf("dnxhr") !== -1 || lower.indexOf("dnx") !== -1) {
    return ".mxf";
  }
  // MXF format
  if (lower.indexOf("mxf") !== -1) {
    return ".mxf";
  }
  // AVI
  if (lower.indexOf("avi") !== -1) {
    return ".avi";
  }
  // HEVC/H.265 - usually .mp4 but could be .mov
  if (lower.indexOf("hevc") !== -1 || lower.indexOf("h.265") !== -1 || lower.indexOf("h265") !== -1) {
    return ".mp4";
  }
  // H.264/AVC → .mp4
  if (lower.indexOf("h.264") !== -1 || lower.indexOf("h264") !== -1 || lower.indexOf("avc") !== -1) {
    return ".mp4";
  }
  // MP4 explicit
  if (lower.indexOf("mp4") !== -1) {
    return ".mp4";
  }
  // MOV explicit
  if (lower.indexOf("mov") !== -1 || lower.indexOf(".mov") !== -1) {
    return ".mov";
  }
  // Wrappers that typically use .mov
  if (lower.indexOf("cineform") !== -1 || lower.indexOf("gopro") !== -1) {
    return ".mov";
  }
  // WAV/audio
  if (lower.indexOf("wav") !== -1 || lower.indexOf("wave") !== -1) {
    return ".wav";
  }
  // MP3
  if (lower.indexOf("mp3") !== -1) {
    return ".mp3";
  }
  // AAC
  if (lower.indexOf("aac") !== -1) {
    return ".m4a";
  }

  return CLAUDE_DEFAULT_EXTENSION;
};

const claude_resultJson = (obj: any) => {
  return JSON.stringify(obj);
};

const claude_sanitizeSegment = (value: string) => {
  // Escape forward slash inside character class for ExtendScript compatibility
  return value.replace(/[\\\/:\*\?"<>|]/g, "_");
};

const claude_ensureExtension = (filename: string, extension?: string) => {
  // Avoid {2,4} quantifier - some ExtendScript versions have issues with it
  if (filename.match(/\.[A-Za-z0-9][A-Za-z0-9][A-Za-z0-9]?[A-Za-z0-9]?$/)) {
    return filename;
  }
  return filename + (extension || CLAUDE_DEFAULT_EXTENSION);
};

const claude_getActiveSequence = () => {
  if (app.project && app.project.activeSequence) {
    return app.project.activeSequence;
  }

  var qeSequence = null;
  try {
    if (app.enableQE) {
      app.enableQE();
    }
    if (qe && qe.project && qe.project.getActiveSequence) {
      qeSequence = qe.project.getActiveSequence();
    }
  } catch (error) {
    qeSequence = null;
  }

  if (qeSequence && app.project && app.project.sequences) {
    var qeName = null;
    try {
      qeName = typeof qeSequence.name === "function" ? qeSequence.name() : qeSequence.name;
    } catch (errorName) {
      qeName = null;
    }
    if (qeName) {
      for (var i = 0; i < app.project.sequences.numSequences; i++) {
        var seq = app.project.sequences[i];
        if (seq && seq.name === qeName) {
          return seq;
        }
      }
    }
  }

  if (app.project && app.project.sequences && app.project.sequences.numSequences === 1) {
    return app.project.sequences[0];
  }

  return null;
};

const claude_getSelectedSequences = () => {
  var selected: any[] = [];
  try {
    if (app.project && app.project.getSelection) {
      selected = app.project.getSelection() || [];
    }
  } catch (error) {
    selected = [];
  }

  var sequences: any[] = [];
  for (var i = 0; i < selected.length; i++) {
    var item = selected[i];
    try {
      if (item && item.isSequence && item.isSequence()) {
        sequences.push(item);
      }
    } catch (errorItem) {}
  }

  if (!sequences.length) {
    var active = claude_getActiveSequence();
    if (active) {
      sequences.push(active);
    }
  }

  return sequences;
};

const claude_uniqueClips = (clips: any[]) => {
  var seen: any = {};
  var result: any[] = [];
  for (var i = 0; i < clips.length; i++) {
    var clip = clips[i];
    var name = clip.name || (clip.projectItem ? clip.projectItem.name : "Clip");
    var start = clip.start ? clip.start.ticks : 0;
    var end = clip.end ? clip.end.ticks : 0;
    var key = name + "|" + start + "|" + end;
    if (seen[key]) {
      continue;
    }
    seen[key] = true;
    result.push(clip);
  }
  return result;
};

const claude_makeTimeFromTicks = (ticks: number) => {
  if (typeof Time === "undefined") {
    return ticks;
  }
  var time = new Time();
  time.ticks = ticks;
  return time;
};

const claude_setSequenceInOut = (sequence: any, inTicks: number, outTicks: number) => {
  if (sequence && sequence.setInPoint) {
    try {
      sequence.setInPoint(inTicks);
    } catch (error) {
      sequence.setInPoint(claude_makeTimeFromTicks(inTicks));
    }
  }
  if (sequence && sequence.setOutPoint) {
    try {
      sequence.setOutPoint(outTicks);
    } catch (error) {
      sequence.setOutPoint(claude_makeTimeFromTicks(outTicks));
    }
  }
};

const claude_getSequenceInOut = (sequence: any) => {
  var inPoint = null;
  var outPoint = null;
  if (sequence && sequence.getInPoint) {
    inPoint = sequence.getInPoint();
  }
  if (sequence && sequence.getOutPoint) {
    outPoint = sequence.getOutPoint();
  }
  return { inPoint: inPoint, outPoint: outPoint };
};

const claude_getSelectedClips = (sequence: any) => {
  var selection: any[] = [];
  if (sequence && sequence.getSelection) {
    selection = sequence.getSelection() || [];
  }

  if ((!selection || selection.length === 0) && app.enableQE) {
    try {
      app.enableQE();
      if (qe && qe.project && qe.project.getActiveSequence) {
        var qeSeq = qe.project.getActiveSequence();
        if (qeSeq && qeSeq.getSelection) {
          selection = qeSeq.getSelection() || [];
        }
      }
    } catch (error) {
      selection = selection || [];
    }
  }

  if (!selection || selection.length === 0) {
    return [];
  }

  var videoClips: any[] = [];
  var fallback: any[] = [];
  for (var i = 0; i < selection.length; i++) {
    var item = selection[i];
    if (!item) {
      continue;
    }
    if (item.mediaType && item.mediaType === "Video") {
      videoClips.push(item);
    } else {
      fallback.push(item);
    }
  }
  return videoClips.length ? videoClips : fallback;
};

// Decode URL-encoded string (e.g., %20 -> space)
const claude_decodeUri = (str: string): string => {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    // Manual decode for common cases if decodeURIComponent fails
    return str.replace(/%20/g, " ").replace(/%2D/g, "-").replace(/%5F/g, "_");
  }
};

// Cache for resolved preset paths to avoid slow repeated searches
var claude_presetPathCache: { [key: string]: string } = {};

// Find preset .epr file path by searching common Adobe preset locations
const claude_findPresetPath = (presetName: string): string | null => {
  // Check cache first
  if (claude_presetPathCache[presetName]) {
    return claude_presetPathCache[presetName];
  }

  // User data folder (~/Library/Application Support on Mac)
  var userDataFolder = Folder.userData ? Folder.userData.fsName : "";
  // Documents folder (~/Documents)
  var documentsFolder = Folder.myDocuments ? Folder.myDocuments.fsName : "";

  var presetDirs = [
    // User presets - Documents folder (primary user preset location)
    documentsFolder + "/Adobe/Adobe Media Encoder/25.0/Presets",
    documentsFolder + "/Adobe/Adobe Media Encoder/24.0/Presets",
    documentsFolder + "/Adobe/Adobe Media Encoder/23.0/Presets",
    documentsFolder + "/Adobe/Adobe Media Encoder/19.0/Presets",
    documentsFolder + "/Adobe/Adobe Media Encoder/Presets",
    // User presets - Application Support folder
    userDataFolder + "/Adobe/Adobe Media Encoder 2026/Presets",
    userDataFolder + "/Adobe/Adobe Media Encoder 2025/Presets",
    userDataFolder + "/Adobe/Adobe Media Encoder 2024/Presets",
    userDataFolder + "/Adobe/Adobe Media Encoder CC 2019/Presets",
    // User presets - Common location
    userDataFolder + "/Adobe/Common/AME/25.0/Presets",
    userDataFolder + "/Adobe/Common/AME/24.0/Presets",
    userDataFolder + "/Adobe/Common/AME/19.0/Presets",
    // System presets (Mac)
    "/Library/Application Support/Adobe/Common/AME/25.0/Presets",
    "/Library/Application Support/Adobe/Common/AME/24.0/Presets",
    "/Library/Application Support/Adobe/Common/AME/19.0/Presets",
    // App bundle presets - Media Encoder
    "/Applications/Adobe Media Encoder 2026/Adobe Media Encoder 2026.app/Contents/MediaIO/systempresets",
    "/Applications/Adobe Media Encoder 2025/Adobe Media Encoder 2025.app/Contents/MediaIO/systempresets",
    "/Applications/Adobe Media Encoder 2024/Adobe Media Encoder 2024.app/Contents/MediaIO/systempresets",
    // App bundle presets - Premiere Pro (includes ingest/proxy presets)
    "/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents/Settings/IngestPresets",
    "/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents/MediaIO/systempresets",
    "/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app/Contents/Settings/IngestPresets",
    "/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app/Contents/MediaIO/systempresets",
  ];

  // Normalize preset name for file matching
  var searchName = presetName.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (var i = 0; i < presetDirs.length; i++) {
    var dir = new Folder(presetDirs[i]);
    if (!dir.exists) continue;

    // Search recursively for .epr files
    var found = claude_searchPresetInFolder(dir, presetName, searchName, 0);
    if (found) {
      // Cache the result for future lookups
      claude_presetPathCache[presetName] = found;
      return found;
    }
  }

  return null;
};

// Recursively search for preset file
const claude_searchPresetInFolder = (folder: any, presetName: string, searchName: string, depth: number): string | null => {
  if (depth > 4) return null; // Limit recursion depth

  var files = folder.getFiles();
  for (var i = 0; i < files.length; i++) {
    var item = files[i];
    if (item instanceof Folder) {
      var found = claude_searchPresetInFolder(item, presetName, searchName, depth + 1);
      if (found) return found;
    } else if (item instanceof File) {
      var name = item.name;
      if (name.indexOf(".epr") !== -1) {
        // Decode URL-encoded filename (e.g., %20 -> space)
        var decodedName = claude_decodeUri(name);
        var lowerName = decodedName.toLowerCase();
        var lowerPreset = presetName.toLowerCase();

        // Match: exact name, contains preset name, or normalized match
        if (lowerName.indexOf(lowerPreset) !== -1) {
          return item.fsName;
        }
        var baseName = decodedName.replace(".epr", "").toLowerCase().replace(/[^a-z0-9]/g, "");
        // Also try removing leading numbers like "00_"
        var baseNameNoPrefix = baseName.replace(/^[0-9]+/, "");
        if (baseName === searchName || baseNameNoPrefix === searchName) {
          return item.fsName;
        }
      }
    }
  }
  return null;
};

// Debug function to list all found preset directories and search for a preset
export const claude_listPresetDirs = (presetName?: string) => {
  var userDataFolder = Folder.userData ? Folder.userData.fsName : "";
  var documentsFolder = Folder.myDocuments ? Folder.myDocuments.fsName : "";
  var presetDirs = [
    // User presets first - Documents folder (primary location)
    documentsFolder + "/Adobe/Adobe Media Encoder/25.0/Presets",
    documentsFolder + "/Adobe/Adobe Media Encoder/24.0/Presets",
    // User presets - Application Support
    userDataFolder + "/Adobe/Adobe Media Encoder 2025/Presets",
    userDataFolder + "/Adobe/Common/AME/25.0/Presets",
    // System presets
    "/Applications/Adobe Media Encoder 2025/Adobe Media Encoder 2025.app/Contents/MediaIO/systempresets",
    "/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app/Contents/Settings/IngestPresets",
    "/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app/Contents/MediaIO/systempresets",
  ];

  var results: string[] = [];
  var foundFiles: string[] = [];
  var searchLog: string[] = [];

  for (var i = 0; i < presetDirs.length; i++) {
    var dir = new Folder(presetDirs[i]);
    results.push(presetDirs[i] + " - exists: " + dir.exists);

    // If directory exists and we have a preset name, do a detailed search
    if (dir.exists && presetName) {
      var filesInDir = claude_debugSearchFolder(dir, presetName, searchLog, 0);
      for (var j = 0; j < filesInDir.length; j++) {
        foundFiles.push(filesInDir[j]);
      }
    }
  }

  return {
    directories: results,
    userDataFolder: userDataFolder,
    documentsFolder: documentsFolder,
    searchingFor: presetName || "(none)",
    foundEprFiles: foundFiles,
    searchLog: searchLog.slice(0, 50) // Limit log entries
  };
};

// Debug version of search that logs what it finds
const claude_debugSearchFolder = (folder: any, presetName: string, log: string[], depth: number): string[] => {
  if (depth > 3) return []; // Limit depth

  var results: string[] = [];
  var searchName = presetName.toLowerCase().replace(/[^a-z0-9]/g, "");

  try {
    var files = folder.getFiles();
    log.push("Dir: " + folder.fsName + " (" + files.length + " items)");

    for (var i = 0; i < files.length; i++) {
      var item = files[i];
      if (item instanceof Folder) {
        // Recurse into subdirectory
        var subResults = claude_debugSearchFolder(item, presetName, log, depth + 1);
        for (var j = 0; j < subResults.length; j++) {
          results.push(subResults[j]);
        }
      } else if (item instanceof File) {
        var name = item.name;
        if (name.indexOf(".epr") !== -1) {
          // Decode URL-encoded filename (e.g., %20 -> space)
          var decodedName = claude_decodeUri(name);
          var lowerName = decodedName.toLowerCase();
          var lowerPreset = presetName.toLowerCase();

          // Normalize both for comparison (remove non-alphanumeric)
          var baseName = decodedName.replace(".epr", "").toLowerCase().replace(/[^a-z0-9]/g, "");
          // Also try removing leading numbers like "00_"
          var baseNameNoPrefix = baseName.replace(/^[0-9]+/, "");

          var matchesContains = lowerName.indexOf(lowerPreset) !== -1;
          var matchesNormalized = baseName === searchName || baseNameNoPrefix === searchName;

          if (matchesContains || matchesNormalized) {
            results.push(item.fsName + " [MATCH]");
            log.push("MATCH: " + decodedName + " (raw: " + name + ")");
          } else {
            // Log first few non-matching files for debug
            if (results.length < 5) {
              log.push("File: " + decodedName + " (no match)");
            }
          }
        }
      }
    }
  } catch (e: any) {
    log.push("Error in " + folder.fsName + ": " + (e?.toString?.() || String(e)));
  }

  return results;
};

// Store last resolved preset path for debugging
var claude_lastResolvedPreset = "";

const claude_queueEncode = (sequence: any, outputPath: string, presetPath: string, workAreaType?: number, skipStartBatch?: boolean) => {
  if (!app.encoder) {
    return { success: false, error: "No encoder" };
  }

  // If presetPath doesn't look like a file path, try to resolve it
  var actualPresetPath = presetPath;
  if (presetPath.indexOf("/") === -1 && presetPath.indexOf("\\") === -1 && presetPath.indexOf(".epr") === -1) {
    var resolved = claude_findPresetPath(presetPath);
    if (resolved) {
      actualPresetPath = resolved;
    }
  }
  claude_lastResolvedPreset = actualPresetPath;

  // Check if the preset file exists
  var presetFile = new File(actualPresetPath);
  var presetExists = presetFile.exists;

  try {
    // Try with removeOnCompletion = false (0) to keep in queue
    var result = app.encoder.encodeSequence(sequence, outputPath, actualPresetPath, workAreaType || app.encoder.ENCODE_ENTIRE, 0);

    // Start batch unless caller will handle it (e.g. batch queueing)
    if (!skipStartBatch && app.encoder.startBatch) {
      try {
        app.encoder.startBatch();
      } catch (batchErr) {
        // startBatch might fail if AME isn't ready, ignore
      }
    }

    return { success: true, presetPath: actualPresetPath, presetExists: presetExists, result: result };
  } catch (error1: any) {
    return { success: false, error: error1?.toString?.() || String(error1), presetPath: actualPresetPath, presetExists: presetExists };
  }
};

const claude_directExport = (sequence: any, outputPath: string, presetPath: string, workAreaType?: number) => {
  if (!sequence || !sequence.exportAsMediaDirect) {
    return false;
  }

  // If presetPath doesn't look like a file path, try to resolve it
  var actualPresetPath = presetPath;
  if (presetPath.indexOf("/") === -1 && presetPath.indexOf("\\") === -1 && presetPath.indexOf(".epr") === -1) {
    var resolved = claude_findPresetPath(presetPath);
    if (resolved) {
      actualPresetPath = resolved;
    }
  }

  try {
    // exportAsMediaDirect(outputPath, presetPath, workAreaType)
    // workAreaType: 0 = entire, 1 = in/out, 2 = work area
    sequence.exportAsMediaDirect(outputPath, actualPresetPath, workAreaType || 0);
    return true;
  } catch (error) {
    return false;
  }
};

// Scan user preset directories and return actual .epr files
export const claude_scanUserPresets = () => {
  var documentsFolder = Folder.myDocuments ? Folder.myDocuments.fsName : "";
  var userDataFolder = Folder.userData ? Folder.userData.fsName : "";

  var userPresetDirs = [
    documentsFolder + "/Adobe/Adobe Media Encoder/25.0/Presets",
    documentsFolder + "/Adobe/Adobe Media Encoder/24.0/Presets",
    documentsFolder + "/Adobe/Adobe Media Encoder/23.0/Presets",
    userDataFolder + "/Adobe/Adobe Media Encoder 2025/Presets",
    userDataFolder + "/Adobe/Common/AME/25.0/Presets",
  ];

  var userPresets: { name: string; path: string; source: string }[] = [];
  var seenPaths: { [key: string]: boolean } = {};

  for (var i = 0; i < userPresetDirs.length; i++) {
    var dir = new Folder(userPresetDirs[i]);
    if (!dir.exists) continue;

    try {
      var files = dir.getFiles("*.epr");
      for (var j = 0; j < files.length; j++) {
        var file = files[j];
        if (file instanceof File && !seenPaths[file.fsName]) {
          seenPaths[file.fsName] = true;
          var fileName = file.name.replace(".epr", "");
          // Decode URL encoding if present
          fileName = claude_decodeUri(fileName);
          userPresets.push({
            name: fileName,
            path: file.fsName,
            source: "user"
          });
        }
      }
    } catch (e) {}
  }

  return { userPresets: userPresets };
};

// ===== EXPORTED FUNCTIONS =====

// Debug function to inspect preset properties
export const claude_debugPreset = () => {
  try {
    if (!app.encoder || !app.encoder.getExporters) {
      return { error: "No encoder" };
    }
    var exporters = app.encoder.getExporters();
    if (!exporters || !exporters.length) {
      return { error: "No exporters" };
    }
    // Get first exporter's first preset
    var exporter = exporters[0];
    if (!exporter || !exporter.getPresets) {
      return { error: "No getPresets method" };
    }
    var presets = exporter.getPresets();
    if (!presets || !presets.length) {
      return { error: "No presets" };
    }
    var p = presets[0];
    // List all properties
    var props: string[] = [];
    for (var key in p) {
      try {
        var val = p[key];
        var valType = typeof val;
        if (valType === "function") {
          props.push(key + ": [function]");
        } else if (valType === "object" && val !== null) {
          props.push(key + ": [object]");
        } else {
          props.push(key + ": " + String(val));
        }
      } catch (e) {
        props.push(key + ": [error]");
      }
    }
    return {
      exporterName: exporter.name,
      presetName: p.name,
      presetMatchName: p.matchName,
      properties: props,
    };
  } catch (e: any) {
    return { error: e?.toString?.() || String(e) };
  }
};

export const claude_getAvailablePresets = () => {
  try {
    if (!app.encoder || !app.encoder.getExporters) {
      return { error: "Adobe Media Encoder not available." };
    }

    try {
      if (app.encoder.launchEncoder) {
        app.encoder.launchEncoder();
      }
    } catch (errorLaunch) {}

    var exporters = app.encoder.getExporters();
    if (!exporters || !exporters.length) {
      return { error: "No Media Encoder exporters found." };
    }

    var presets: ClaudePresetInfo[] = [];
    var seen: any = {};

    for (var i = 0; i < exporters.length; i++) {
      var exporter = exporters[i];
      if (!exporter || !exporter.getPresets) {
        continue;
      }
      var exporterName = exporter.name || "Exporter";
      var exporterPresets = exporter.getPresets();
      if (!exporterPresets) {
        continue;
      }
      for (var j = 0; j < exporterPresets.length; j++) {
        var preset = exporterPresets[j];
        if (!preset) {
          continue;
        }
        var presetName = preset.name || preset.matchName;
        if (!presetName) {
          continue;
        }
        if (seen[presetName]) {
          continue;
        }
        seen[presetName] = true;

        // Try multiple ways to get the preset path
        var presetPath = null;

        // Method 1: Direct path property from preset object
        if (preset.path) {
          presetPath = preset.path;
        }

        // Method 2: matchName might be the path if it ends with .epr
        if (!presetPath && preset.matchName) {
          var matchName = preset.matchName;
          if (matchName.indexOf(".epr") !== -1 || matchName.indexOf("/") !== -1 || matchName.indexOf("\\") !== -1) {
            presetPath = matchName;
          }
        }

        // Method 3: Use getPresetPathByName API
        if (!presetPath && app.encoder.getPresetPathByName) {
          try {
            presetPath = app.encoder.getPresetPathByName(presetName);
          } catch (error) {
            presetPath = null;
          }
        }

        // Method 4: For built-in presets, use matchName as identifier
        if (!presetPath && preset.matchName) {
          presetPath = preset.matchName;
        }

        presets.push({
          name: presetName,
          matchName: preset.matchName || presetName,
          path: presetPath,
          exporter: exporterName,
        });
      }
    }

    return { presets: presets };
  } catch (error) {
    return { error: "Preset scan failed: " + error.toString() };
  }
};

export const claude_selectOutputFolder = () => {
  try {
    var folder = Folder.selectDialog("Select output folder");
    if (!folder) {
      return { canceled: true };
    }
    return { path: folder.fsName };
  } catch (error) {
    return { error: "Folder dialog failed: " + error.toString() };
  }
};

export const claude_getProjectDirectory = () => {
  try {
    if (!app.project || !app.project.path) {
      return { error: "No project open or project not saved." };
    }
    var projectFile = new File(app.project.path);
    var projectFolder = projectFile.parent;
    if (projectFolder && projectFolder.exists) {
      return { path: projectFolder.fsName };
    }
    return { error: "Project directory not found." };
  } catch (error: any) {
    return { error: "Failed to get project directory: " + (error?.toString?.() || String(error)) };
  }
};

export const claude_getProjectName = () => {
  try {
    if (!app.project || !app.project.path) {
      return { name: null };
    }
    var projectFile = new File(app.project.path);
    return { name: projectFile.name };
  } catch (error: any) {
    return { name: null };
  }
};

type RenameClipsPayload = {
  template: string;
};

export const claude_renameSelectedClips = (payload: RenameClipsPayload) => {
  var sequence = claude_getActiveSequence();
  if (!sequence) {
    return { error: "No active sequence" };
  }

  var clips = claude_uniqueClips(claude_getSelectedClips(sequence));
  if (!clips.length) {
    return { error: "No clips selected" };
  }

  var renamed = 0;
  var errors: string[] = [];

  for (var i = 0; i < clips.length; i++) {
    var clip = clips[i];
    // Generate padded index
    var paddedIndex = String(i + 1);
    while (paddedIndex.length < 3) {
      paddedIndex = "0" + paddedIndex;
    }

    var seqName = sequence.name || "Sequence";
    var clipName = clip.name || (clip.projectItem ? clip.projectItem.name : "Clip");

    // Apply template
    var newName = payload.template;
    newName = newName.replace(/\{index\}/g, paddedIndex);
    newName = newName.replace(/\{sequence\}/g, seqName);
    newName = newName.replace(/\{clip\}/g, clipName);

    // Remove file extension if present (for display name)
    newName = newName.replace(/\.[a-zA-Z0-9]+$/, "");

    // Try to rename the clip
    try {
      // Method 1: Direct name property assignment
      clip.name = newName;
      renamed++;
    } catch (e1) {
      // Method 2: Try projectItem.name as fallback
      try {
        if (clip.projectItem) {
          clip.projectItem.name = newName;
          renamed++;
        } else {
          errors.push(clipName);
        }
      } catch (e2) {
        errors.push(clipName);
      }
    }
  }

  return { renamed: renamed, total: clips.length, errors: errors };
};

export const claude_getSequenceSummary = () => {
  var activeName = null;
  var selectedCount = 0;
  try {
    if (app.project && app.project.activeSequence) {
      activeName = app.project.activeSequence.name || null;
    }
  } catch (errorActive) {}

  try {
    var selection = claude_getSelectedSequences();
    selectedCount = selection.length;
  } catch (errorSelection) {}

  return {
    activeSequenceName: activeName,
    selectedCount: selectedCount,
  };
};

export const claude_queueExport = (payload: ClaudeQueuePayload) => {
  if (!payload || !payload.presetPath) {
    return { error: "Preset not set." };
  }
  if (!payload.outputPath) {
    return { error: "Output destination missing." };
  }
  if (!app.project) {
    return { error: "No project open." };
  }
  if (!app.encoder) {
    return { error: "Adobe Media Encoder not available." };
  }

  try {
    if (app.encoder && app.encoder.launchEncoder) {
      app.encoder.launchEncoder();
    }
  } catch (error) {}

  var folder = new Folder(payload.outputPath);
  if (!folder.exists) {
    if (!folder.create()) {
      return { error: "Output folder not available." };
    }
  }

  var sequences = claude_getSelectedSequences();
  if (!sequences.length) {
    return { error: "No active or selected sequences." };
  }

  var queued = 0;
  var errors: string[] = [];
  var debugInfo: any = null;

  for (var i = 0; i < sequences.length; i++) {
    var seq = sequences[i];
    var seqName = seq && seq.name ? seq.name : "Sequence";
    var baseName = claude_sanitizeSegment(seqName);
    if (sequences.length > 1) {
      baseName = baseName + "_" + (i + 1);
    }
    var filename = claude_ensureExtension(baseName, payload.extension);
    var outputFile = new File(folder.fsName + "/" + filename);

    var result = claude_queueEncode(seq, outputFile.fsName, payload.presetPath);
    if (result.success) {
      queued++;
      if (!debugInfo) {
        debugInfo = { presetPath: result.presetPath, presetExists: result.presetExists };
      }
    } else {
      errors.push(seqName + ": " + (result.error || "unknown error"));
      if (!debugInfo) {
        debugInfo = { presetPath: result.presetPath, presetExists: result.presetExists, error: result.error };
      }
    }
  }

  return { queued: queued, errors: errors, debug: debugInfo };
};

export const claude_queueSelectedClips = (payload: ClaudeQueuePayload) => {
  if (!payload || !payload.presetPath) {
    return { error: "Preset not set." };
  }
  if (!payload.outputPath) {
    return { error: "Output destination missing." };
  }

  var sequence = claude_getActiveSequence();
  if (!sequence) {
    return { error: "No active sequence." };
  }

  var clips = claude_uniqueClips(claude_getSelectedClips(sequence));
  if (!clips.length) {
    return { error: "No clips selected in timeline." };
  }

  try {
    if (app.encoder && app.encoder.launchEncoder) {
      app.encoder.launchEncoder();
    }
  } catch (error) {}

  var folder = new Folder(payload.outputPath);
  if (!folder.exists) {
    if (!folder.create()) {
      return { error: "Output folder not available." };
    }
  }

  var originalInOut = claude_getSequenceInOut(sequence);
  var queued = 0;
  var debugInfo: any = null;

  for (var i = 0; i < clips.length; i++) {
    var clip = clips[i];
    var clipName = clip.name || (clip.projectItem ? clip.projectItem.name : "Clip");
    var baseName = claude_sanitizeSegment((sequence.name || "Sequence") + "_" + clipName + "_" + (i + 1));
    var filename = claude_ensureExtension(baseName, payload.extension);
    var outputFile = new File(folder.fsName + "/" + filename);

    var startTicks = clip.start ? clip.start.ticks : 0;
    var endTicks = clip.end ? clip.end.ticks : 0;
    claude_setSequenceInOut(sequence, startTicks, endTicks);

    var result = claude_queueEncode(sequence, outputFile.fsName, payload.presetPath, app.encoder.ENCODE_IN_TO_OUT);
    if (result.success) {
      queued++;
    }
    // Capture debug info from first call
    if (!debugInfo) {
      debugInfo = { presetPath: result.presetPath, presetExists: result.presetExists, error: result.error };
    }
  }

  if (originalInOut.inPoint !== null) {
    sequence.setInPoint(originalInOut.inPoint);
  }
  if (originalInOut.outPoint !== null) {
    sequence.setOutPoint(originalInOut.outPoint);
  }

  return { queued: queued, clips: clips.length, debug: debugInfo };
};

// ===== DIRECT EXPORT FUNCTIONS (No Dynamic Link overhead) =====

export const claude_exportDirect = (payload: ClaudeQueuePayload) => {
  if (!payload || !payload.presetPath) {
    return { error: "Preset not set." };
  }
  if (!payload.outputPath) {
    return { error: "Output destination missing." };
  }
  if (!app.project) {
    return { error: "No project open." };
  }

  var folder = new Folder(payload.outputPath);
  if (!folder.exists) {
    if (!folder.create()) {
      return { error: "Output folder not available." };
    }
  }

  var sequences = claude_getSelectedSequences();
  if (!sequences.length) {
    return { error: "No active or selected sequences." };
  }

  var queued = 0;
  var errors: string[] = [];

  for (var i = 0; i < sequences.length; i++) {
    var seq = sequences[i];
    var seqName = seq && seq.name ? seq.name : "Sequence";
    var baseName = claude_sanitizeSegment(seqName);
    if (sequences.length > 1) {
      baseName = baseName + "_" + (i + 1);
    }
    var filename = claude_ensureExtension(baseName, payload.extension);
    var outputFile = new File(folder.fsName + "/" + filename);

    if (claude_directExport(seq, outputFile.fsName, payload.presetPath, 0)) {
      queued++;
    } else {
      errors.push(seqName);
    }
  }

  return { queued: queued, errors: errors };
};

export const claude_exportSelectedClipsDirect = (payload: ClaudeQueuePayload) => {
  if (!payload || !payload.presetPath) {
    return { error: "Preset not set." };
  }
  if (!payload.outputPath) {
    return { error: "Output destination missing." };
  }

  var sequence = claude_getActiveSequence();
  if (!sequence) {
    return { error: "No active sequence." };
  }

  if (!sequence.exportAsMediaDirect) {
    return { error: "Direct export not available in this version of Premiere Pro." };
  }

  var clips = claude_uniqueClips(claude_getSelectedClips(sequence));
  if (!clips.length) {
    return { error: "No clips selected in timeline." };
  }

  var folder = new Folder(payload.outputPath);
  if (!folder.exists) {
    if (!folder.create()) {
      return { error: "Output folder not available." };
    }
  }

  var originalInOut = claude_getSequenceInOut(sequence);
  var queued = 0;

  for (var i = 0; i < clips.length; i++) {
    var clip = clips[i];
    var clipName = clip.name || (clip.projectItem ? clip.projectItem.name : "Clip");
    var baseName = claude_sanitizeSegment((sequence.name || "Sequence") + "_" + clipName + "_" + (i + 1));
    var filename = claude_ensureExtension(baseName, payload.extension);
    var outputFile = new File(folder.fsName + "/" + filename);

    var startTicks = clip.start ? clip.start.ticks : 0;
    var endTicks = clip.end ? clip.end.ticks : 0;
    claude_setSequenceInOut(sequence, startTicks, endTicks);

    if (claude_directExport(sequence, outputFile.fsName, payload.presetPath, 1)) {
      queued++;
    }
  }

  if (originalInOut.inPoint !== null) {
    sequence.setInPoint(originalInOut.inPoint);
  }
  if (originalInOut.outPoint !== null) {
    sequence.setOutPoint(originalInOut.outPoint);
  }

  return { queued: queued, clips: clips.length };
};

// ===== SEQUENCE STATE SNAPSHOT =====

// Capture full sequence state: clip enabled/disabled + track mute states
export const claude_getTrackVisibility = () => {
  var sequence = claude_getActiveSequence();
  if (!sequence) {
    return { error: "No active sequence." };
  }

  var videoClips: boolean[][] = [];
  var audioClips: boolean[][] = [];
  var videoTrackMutes: number[] = [];
  var audioTrackMutes: number[] = [];

  for (var v = 0; v < sequence.videoTracks.numTracks; v++) {
    var vTrack = sequence.videoTracks[v];

    // Track mute state (eye icon)
    try {
      videoTrackMutes.push(vTrack.isMuted() ? 1 : 0);
    } catch (e) {
      videoTrackMutes.push(0);
    }

    // Clip disabled states
    var trackClips: boolean[] = [];
    for (var vc = 0; vc < vTrack.clips.numItems; vc++) {
      try {
        trackClips.push(vTrack.clips[vc].disabled ? true : false);
      } catch (e) {
        trackClips.push(false);
      }
    }
    videoClips.push(trackClips);
  }

  for (var a = 0; a < sequence.audioTracks.numTracks; a++) {
    var aTrack = sequence.audioTracks[a];

    // Track mute state
    try {
      audioTrackMutes.push(aTrack.isMuted() ? 1 : 0);
    } catch (e) {
      audioTrackMutes.push(0);
    }

    // Clip disabled states
    var aTrackClips: boolean[] = [];
    for (var ac = 0; ac < aTrack.clips.numItems; ac++) {
      try {
        aTrackClips.push(aTrack.clips[ac].disabled ? true : false);
      } catch (e) {
        aTrackClips.push(false);
      }
    }
    audioClips.push(aTrackClips);
  }

  return {
    videoClips: videoClips,
    audioClips: audioClips,
    videoTrackMutes: videoTrackMutes,
    audioTrackMutes: audioTrackMutes,
  };
};

type SequenceStatePayload = {
  videoClips: boolean[][];
  audioClips: boolean[][];
  videoTrackMutes?: number[];
  audioTrackMutes?: number[];
};

// Restore full sequence state: clip enabled/disabled + track mute states
export const claude_setTrackVisibility = (payload: SequenceStatePayload) => {
  var sequence = claude_getActiveSequence();
  if (!sequence) {
    return { error: "No active sequence." };
  }

  var applied = 0;

  // Restore video track mutes
  if (payload.videoTrackMutes) {
    for (var vm = 0; vm < payload.videoTrackMutes.length; vm++) {
      if (vm >= sequence.videoTracks.numTracks) continue;
      try {
        sequence.videoTracks[vm].setMute(payload.videoTrackMutes[vm]);
        applied++;
      } catch (e) {}
    }
  }

  // Restore audio track mutes
  if (payload.audioTrackMutes) {
    for (var am = 0; am < payload.audioTrackMutes.length; am++) {
      if (am >= sequence.audioTracks.numTracks) continue;
      try {
        sequence.audioTracks[am].setMute(payload.audioTrackMutes[am]);
        applied++;
      } catch (e) {}
    }
  }

  // Restore video clip disabled states
  if (payload.videoClips) {
    for (var v = 0; v < payload.videoClips.length; v++) {
      if (v >= sequence.videoTracks.numTracks) continue;
      var vTrack = sequence.videoTracks[v];
      for (var vc = 0; vc < payload.videoClips[v].length; vc++) {
        if (vc >= vTrack.clips.numItems) continue;
        try {
          vTrack.clips[vc].disabled = payload.videoClips[v][vc];
          applied++;
        } catch (e) {}
      }
    }
  }

  // Restore audio clip disabled states
  if (payload.audioClips) {
    for (var a = 0; a < payload.audioClips.length; a++) {
      if (a >= sequence.audioTracks.numTracks) continue;
      var aTrack = sequence.audioTracks[a];
      for (var ac = 0; ac < payload.audioClips[a].length; ac++) {
        if (ac >= aTrack.clips.numItems) continue;
        try {
          aTrack.clips[ac].disabled = payload.audioClips[a][ac];
          applied++;
        } catch (e) {}
      }
    }
  }

  return { applied: applied };
};

// ===== EDIT POINT DETECTION =====

type EditPointsPayload = {
  sequenceName: string;
  inPointTicks?: number;
  outPointTicks?: number;
};

export const claude_getEditPoints = (payload: EditPointsPayload) => {
  if (!app.project || !app.project.sequences) {
    return { error: "No project open." };
  }

  // Find the sequence by name
  var sequence = null;
  for (var i = 0; i < app.project.sequences.numSequences; i++) {
    var seq = app.project.sequences[i];
    if (seq && seq.name === payload.sequenceName) {
      sequence = seq;
      break;
    }
  }

  if (!sequence) {
    return { error: "Sequence not found: " + payload.sequenceName };
  }

  // Find highest active video track (iterate from top down)
  var trackIndex = -1;
  var activeTrack = null;
  for (var t = sequence.videoTracks.numTracks - 1; t >= 0; t--) {
    var track = sequence.videoTracks[t];
    if (track && track.clips && track.clips.numItems > 0) {
      trackIndex = t;
      activeTrack = track;
      break;
    }
  }

  if (!activeTrack) {
    return { error: "No video tracks with clips found." };
  }

  // Determine range bounds
  var TICKS_PER_SECOND = 254016000000;
  var rangeStart = payload.inPointTicks !== undefined ? payload.inPointTicks : 0;
  var rangeEnd = payload.outPointTicks !== undefined ? payload.outPointTicks : 0;

  // If no outPoint specified, use the end of the last clip on this track
  if (rangeEnd === 0) {
    for (var c = 0; c < activeTrack.clips.numItems; c++) {
      var cl = activeTrack.clips[c];
      if (cl && cl.end && cl.end.ticks > rangeEnd) {
        rangeEnd = cl.end.ticks;
      }
    }
  }

  // Collect all clip boundaries (start and end ticks)
  var boundaries: number[] = [];
  var clipCount = 0;
  for (var ci = 0; ci < activeTrack.clips.numItems; ci++) {
    var clip = activeTrack.clips[ci];
    if (!clip) continue;
    var clipStart = clip.start ? clip.start.ticks : 0;
    var clipEnd = clip.end ? clip.end.ticks : 0;

    // Only count clips that overlap the range
    if (clipEnd <= rangeStart || clipStart >= rangeEnd) continue;
    clipCount++;

    boundaries.push(clipStart);
    boundaries.push(clipEnd);
  }

  // Sort and deduplicate
  boundaries.sort(function (a, b) { return a - b; });
  var unique: number[] = [];
  for (var u = 0; u < boundaries.length; u++) {
    if (u === 0 || boundaries[u] !== boundaries[u - 1]) {
      unique.push(boundaries[u]);
    }
  }

  // Filter to within range, exclude the range start and end themselves
  // Convert to seconds relative to rangeStart
  var cuts: number[] = [];
  for (var f = 0; f < unique.length; f++) {
    var tick = unique[f];
    if (tick <= rangeStart || tick >= rangeEnd) continue;
    var seconds = (tick - rangeStart) / TICKS_PER_SECOND;
    // Round to 4 decimal places
    cuts.push(Math.round(seconds * 10000) / 10000);
  }

  return {
    cuts: cuts,
    trackIndex: trackIndex,
    trackName: "V" + (trackIndex + 1),
    clipCount: clipCount,
  };
};

// ===== QUEUE FUNCTIONS =====

type QueueInfoPayload = {
  exportType?: "clips" | "sequences";
};

type QueueItemInfo = {
  sequenceName: string;
  clipName?: string;
  clipIndex?: number;
  startTicks?: number;
  endTicks?: number;
  useInOut?: boolean;
};

// Get info about sequences/clips to add to queue (without exporting)
export const claude_getQueueInfo = (payload: QueueInfoPayload) => {
  if (!app.project) {
    return { error: "No project open." };
  }

  var items: QueueItemInfo[] = [];

  if (payload.exportType === "clips") {
    // Get selected clips from active sequence
    var sequence = claude_getActiveSequence();
    if (!sequence) {
      return { error: "No active sequence." };
    }

    var clips = claude_uniqueClips(claude_getSelectedClips(sequence));
    if (!clips.length) {
      return { error: "No clips selected in timeline." };
    }

    for (var i = 0; i < clips.length; i++) {
      var clip = clips[i];
      var clipName = clip.name || (clip.projectItem ? clip.projectItem.name : "Clip");
      items.push({
        sequenceName: sequence.name || "Sequence",
        clipName: clipName,
        clipIndex: i,
        startTicks: clip.start ? clip.start.ticks : 0,
        endTicks: clip.end ? clip.end.ticks : 0,
      });
    }
  } else {
    // Get selected/active sequences
    var sequences = claude_getSelectedSequences();
    if (!sequences.length) {
      return { error: "No active or selected sequences." };
    }

    for (var j = 0; j < sequences.length; j++) {
      var seq = sequences[j];
      // Get sequence duration (end time)
      var seqEndTicks = 0;
      try {
        if (seq.end && seq.end.ticks) {
          seqEndTicks = Number(seq.end.ticks);
        }
      } catch (e) {}

      // Check for in/out points
      var startTicks = 0;
      var endTicks = seqEndTicks;
      var useInOut = false;

      try {
        var ioPoints = claude_getSequenceInOut(seq);
        if (ioPoints.inPoint !== null && ioPoints.inPoint !== undefined) {
          var inTicks = Number(ioPoints.inPoint);
          if (!isNaN(inTicks) && inTicks >= 0) {
            startTicks = inTicks;
          }
        }
        if (ioPoints.outPoint !== null && ioPoints.outPoint !== undefined) {
          var outTicks = Number(ioPoints.outPoint);
          if (!isNaN(outTicks) && outTicks > 0) {
            endTicks = outTicks;
          }
        }
        // If in/out differ from the full sequence range, use in/out mode
        if (startTicks > 0 || (endTicks > 0 && endTicks < seqEndTicks)) {
          useInOut = true;
        }
      } catch (e) {}

      items.push({
        sequenceName: seq.name || "Sequence",
        clipIndex: j,
        startTicks: startTicks,
        endTicks: endTicks,
        useInOut: useInOut,
      });
    }
  }

  return { items: items };
};

type ExportQueueItemPayload = {
  sequenceName: string;
  clipName?: string;
  clipIndex?: number;
  startTicks?: number;
  endTicks?: number;
  useInOut?: boolean;
  presetPath: string;
  outputPath: string;
  expectedFilename: string; // Pre-computed filename like "001 - Sequence Name.mp4"
};

// Export a single queue item directly (for sequential direct export)
export const claude_exportQueueItem = (payload: ExportQueueItemPayload) => {
  if (!payload || !payload.presetPath) {
    return { error: "Preset not set." };
  }
  if (!payload.outputPath) {
    return { error: "Output destination missing." };
  }

  // Find the sequence by name
  var sequence = null;
  if (app.project && app.project.sequences) {
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
      var seq = app.project.sequences[i];
      if (seq && seq.name === payload.sequenceName) {
        sequence = seq;
        break;
      }
    }
  }

  if (!sequence) {
    return { error: "Sequence not found: " + payload.sequenceName };
  }

  var folder = new Folder(payload.outputPath);
  if (!folder.exists) {
    if (!folder.create()) {
      return { error: "Output folder not available." };
    }
  }

  // Use the pre-computed expectedFilename from payload
  var outputFile = new File(folder.fsName + "/" + payload.expectedFilename);

  // Set in/out points if this is a clip export
  var originalInOut = null;
  if (payload.startTicks !== undefined && payload.endTicks !== undefined) {
    originalInOut = claude_getSequenceInOut(sequence);
    claude_setSequenceInOut(sequence, payload.startTicks, payload.endTicks);
  }

  // Export: use in/out mode for clips or sequences with in/out points set
  var workAreaType = (payload.clipName || payload.useInOut) ? 1 : 0; // 1 = in/out, 0 = entire
  var success = claude_directExport(sequence, outputFile.fsName, payload.presetPath, workAreaType);

  // Restore in/out points
  if (originalInOut) {
    if (originalInOut.inPoint !== null) {
      sequence.setInPoint(originalInOut.inPoint);
    }
    if (originalInOut.outPoint !== null) {
      sequence.setOutPoint(originalInOut.outPoint);
    }
  }

  if (success) {
    // Get file size if available (file may still be writing)
    var fileSize = 0;
    try {
      var checkFile = new File(outputFile.fsName);
      if (checkFile.exists) {
        checkFile.open("r");
        fileSize = checkFile.length;
        checkFile.close();
      }
    } catch (sizeErr) {}

    // Calculate duration in seconds from ticks
    var durationSeconds = 0;
    if (payload.startTicks !== undefined && payload.endTicks !== undefined) {
      // Premiere uses 254016000000 ticks per second
      var ticksPerSecond = 254016000000;
      durationSeconds = (payload.endTicks - payload.startTicks) / ticksPerSecond;
    }

    return {
      success: true,
      outputPath: outputFile.fsName,
      filename: payload.expectedFilename,
      fileSize: fileSize,
      durationSeconds: durationSeconds,
      startTicks: payload.startTicks,
      endTicks: payload.endTicks
    };
  } else {
    return { error: "Export failed" };
  }
};

type BatchQueuePayload = {
  items: ExportQueueItemPayload[];
};

// Queue all items to AME at once (for batch queueing)
export const claude_queueBatchToAME = (payload: BatchQueuePayload) => {
  if (!payload || !payload.items || !payload.items.length) {
    return { error: "No items to queue." };
  }

  if (!app.encoder) {
    return { error: "Adobe Media Encoder not available." };
  }

  try {
    if (app.encoder.launchEncoder) {
      app.encoder.launchEncoder();
    }
  } catch (e) {}

  var queued = 0;
  var errors: string[] = [];

  for (var i = 0; i < payload.items.length; i++) {
    var item = payload.items[i];

    // Find the sequence
    var sequence = null;
    if (app.project && app.project.sequences) {
      for (var j = 0; j < app.project.sequences.numSequences; j++) {
        var seq = app.project.sequences[j];
        if (seq && seq.name === item.sequenceName) {
          sequence = seq;
          break;
        }
      }
    }

    if (!sequence) {
      errors.push("Sequence not found: " + item.sequenceName);
      continue;
    }

    var folder = new Folder(item.outputPath);
    if (!folder.exists) {
      if (!folder.create()) {
        errors.push("Cannot create folder for: " + item.sequenceName);
        continue;
      }
    }

    // Use the pre-computed expectedFilename from payload
    var outputFile = new File(folder.fsName + "/" + item.expectedFilename);

    // Set in/out points if this is a clip export
    var originalInOut = null;
    if (item.startTicks !== undefined && item.endTicks !== undefined) {
      originalInOut = claude_getSequenceInOut(sequence);
      claude_setSequenceInOut(sequence, item.startTicks, item.endTicks);
    }

    var workAreaType = (item.clipName || item.useInOut) ? app.encoder.ENCODE_IN_TO_OUT : app.encoder.ENCODE_ENTIRE;
    var result = claude_queueEncode(sequence, outputFile.fsName, item.presetPath, workAreaType, true);

    // Restore in/out points
    if (originalInOut) {
      if (originalInOut.inPoint !== null) {
        sequence.setInPoint(originalInOut.inPoint);
      }
      if (originalInOut.outPoint !== null) {
        sequence.setOutPoint(originalInOut.outPoint);
      }
    }

    if (result.success) {
      queued++;
    } else {
      errors.push((item.clipName || item.sequenceName) + ": " + (result.error || "unknown error"));
    }
  }

  // Start the batch after all items are queued
  if (app.encoder.startBatch) {
    try {
      app.encoder.startBatch();
    } catch (batchErr) {}
  }

  return { queued: queued, errors: errors };
};

// ===== MARKER FUNCTIONS =====

type MarkerInfoPayload = {};

// Get all markers from the active sequence
export const claude_getMarkerInfo = (payload: MarkerInfoPayload) => {
  var sequence = claude_getActiveSequence();
  if (!sequence) {
    return { error: "No active sequence." };
  }
  if (!sequence.markers) {
    return { error: "Markers not available in this sequence." };
  }

  var markers: any[] = [];

  // Use getFirstMarker/getNextMarker iterator pattern (bracket indexing is unreliable)
  var marker: any = null;
  try { marker = sequence.markers.getFirstMarker(); } catch (e) {}

  if (!marker) {
    return { error: "No markers found in the active sequence." };
  }

  var i = 0;
  while (marker) {
    var name = "";
    try { name = marker.name || ""; } catch (e) {}
    var comments = "";
    try { comments = marker.comments || ""; } catch (e) {}
    var ticks = 0;
    try {
      if (marker.start && marker.start.ticks) {
        ticks = Number(marker.start.ticks);
      }
    } catch (e) {}
    var colorIndex = 0;
    try { colorIndex = marker.getColorByIndex(); } catch (e) {}

    markers.push({
      name: name || ("Marker " + (i + 1)),
      ticks: ticks,
      index: i,
      comments: comments,
      colorIndex: colorIndex,
    });

    i++;
    try { marker = sequence.markers.getNextMarker(marker); } catch (e) { marker = null; }
  }

  if (!markers.length) {
    return { error: "No markers found in the active sequence." };
  }

  return {
    sequenceName: sequence.name || "Sequence",
    markers: markers,
  };
};

type MarkerQueuePayload = {
  secondsBefore: number;
  secondsAfter: number;
};

// Build queue items from markers with before/after duration offsets
export const claude_getMarkerQueueInfo = (payload: MarkerQueuePayload) => {
  var sequence = claude_getActiveSequence();
  if (!sequence) {
    return { error: "No active sequence." };
  }
  if (!sequence.markers) {
    return { error: "Markers not available." };
  }

  var TICKS_PER_SECOND = 254016000000;
  var beforeTicks = Math.round((payload.secondsBefore || 0) * TICKS_PER_SECOND);
  var afterTicks = Math.round((payload.secondsAfter || 0) * TICKS_PER_SECOND);

  // Get sequence bounds
  var seqStartTicks = 0;
  var seqEndTicks = 0;
  try {
    if (sequence.end && sequence.end.ticks) {
      seqEndTicks = Number(sequence.end.ticks);
    }
  } catch (e) {}

  var items: any[] = [];

  // Use getFirstMarker/getNextMarker iterator pattern (bracket indexing is unreliable)
  var marker: any = null;
  try { marker = sequence.markers.getFirstMarker(); } catch (e) {}

  if (!marker) {
    return { error: "No markers found in the active sequence." };
  }

  var i = 0;
  while (marker) {
    var markerTicks = 0;
    try {
      if (marker.start && marker.start.ticks) {
        markerTicks = Number(marker.start.ticks);
      }
    } catch (e) {}

    var markerName = "";
    try { markerName = marker.name || ""; } catch (e) {}
    if (!markerName) markerName = "Marker " + (i + 1);
    var colorIndex = 0;
    try { colorIndex = marker.getColorByIndex(); } catch (e) {}

    // Clamp start/end to sequence bounds
    var startTicks = markerTicks - beforeTicks;
    if (startTicks < seqStartTicks) startTicks = seqStartTicks;
    var endTicks = markerTicks + afterTicks;
    if (seqEndTicks > 0 && endTicks > seqEndTicks) endTicks = seqEndTicks;

    // Ensure valid range
    if (endTicks > startTicks) {
      items.push({
        sequenceName: sequence.name || "Sequence",
        markerName: markerName,
        markerIndex: i,
        markerTicks: markerTicks,
        startTicks: startTicks,
        endTicks: endTicks,
        clipIndex: i,
        colorIndex: colorIndex,
      });
    }

    i++;
    try { marker = sequence.markers.getNextMarker(marker); } catch (e) { marker = null; }
  }

  if (!items.length) {
    return { error: "No valid marker regions found." };
  }

  return { items: items };
};

type FrameExportPayload = {
  timeTicks: number;
  outputFilePath: string;
};

// Export a single JPEG frame at a given time position
export const claude_exportFrameJPEG = (payload: FrameExportPayload) => {
  var sequence = app.project.activeSequence;
  if (!sequence) {
    return { error: "No active sequence." };
  }

  try {
    // Move playhead to the marker position first - required for frame export
    sequence.setPlayerPosition(String(payload.timeTicks));

    // Enable QE DOM and export via QE sequence
    app.enableQE();
    if (qe && qe.project && qe.project.getActiveSequence) {
      var qeSeq = qe.project.getActiveSequence();
      if (qeSeq && qeSeq.exportFrameJPEG) {
        var cti = qeSeq.CTI;
        qeSeq.exportFrameJPEG(cti.timecode, payload.outputFilePath);

        var fileSize = 0;
        try {
          var checkFile = new File(payload.outputFilePath);
          if (checkFile.exists) {
            checkFile.open("r");
            fileSize = checkFile.length;
            checkFile.close();
          }
        } catch (sizeErr) {}

        return {
          success: true,
          outputPath: payload.outputFilePath,
          fileSize: fileSize,
        };
      }
    }

    return { error: "exportFrameJPEG not available in this version of Premiere Pro." };
  } catch (e: any) {
    return { error: "Frame export failed: " + (e?.toString?.() || String(e)) };
  }
};

type ValidatePresetPayload = {
  presetName: string;
  presetPath: string;
};

// Validate a preset path and attempt re-resolution if broken
export const claude_validatePresetPath = (payload: ValidatePresetPayload) => {
  // Check if the stored path exists
  var file = new File(payload.presetPath);
  if (file.exists) {
    return { valid: true, path: payload.presetPath };
  }

  // Path is broken - try to find the preset by name
  var resolved = claude_findPresetPath(payload.presetName);
  if (resolved) {
    return { valid: false, resolved: true, path: resolved };
  }

  return { valid: false, resolved: false, path: null };
};
