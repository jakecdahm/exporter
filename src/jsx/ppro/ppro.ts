/* eslint-disable no-undef */

type PresetInfo = {
  name: string;
  matchName?: string;
  path?: string;
  exporter?: string;
};

type QueuePayload = {
  presetPath?: string;
  outputPath?: string;
  extension?: string;
  exportSelectedClips?: boolean;
};

const DEFAULT_EXTENSION = ".mp4";

const resultJson = (obj: any) => {
  return JSON.stringify(obj);
};

const sanitizeSegment = (value: string) => {
  // Escape forward slash inside character class for ExtendScript compatibility
  return value.replace(/[\\\/:\*\?"<>|]/g, "_");
};

const ensureExtension = (filename: string, extension?: string) => {
  // Avoid {2,4} quantifier - ExtendScript has issues with it
  if (filename.match(/\.[A-Za-z0-9][A-Za-z0-9][A-Za-z0-9]?[A-Za-z0-9]?$/)) {
    return filename;
  }
  return filename + (extension || DEFAULT_EXTENSION);
};

const getActiveSequence = () => {
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

const getSelectedSequences = () => {
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
    var active = getActiveSequence();
    if (active) {
      sequences.push(active);
    }
  }

  return sequences;
};

const uniqueClips = (clips: any[]) => {
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

const makeTimeFromTicks = (ticks: number) => {
  if (typeof Time === "undefined") {
    return ticks;
  }
  var time = new Time();
  time.ticks = ticks;
  return time;
};

const setSequenceInOut = (sequence: any, inTicks: number, outTicks: number) => {
  if (sequence && sequence.setInPoint) {
    try {
      sequence.setInPoint(inTicks);
    } catch (error) {
      sequence.setInPoint(makeTimeFromTicks(inTicks));
    }
  }
  if (sequence && sequence.setOutPoint) {
    try {
      sequence.setOutPoint(outTicks);
    } catch (error) {
      sequence.setOutPoint(makeTimeFromTicks(outTicks));
    }
  }
};

const getSequenceInOut = (sequence: any) => {
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

const getSelectedClips = (sequence: any) => {
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

const queueEncode = (sequence: any, outputPath: string, presetPath: string, workAreaType?: number) => {
  if (!app.encoder) {
    return false;
  }
  try {
    app.encoder.encodeSequence(sequence, outputPath, presetPath, workAreaType || app.encoder.ENCODE_ENTIRE, 1);
    return true;
  } catch (error1) {
    try {
      app.encoder.encodeSequence(sequence, outputPath, presetPath, workAreaType || app.encoder.ENCODE_ENTIRE);
      return true;
    } catch (error2) {
      return false;
    }
  }
};

export const getAvailablePresets = () => {
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

    var presets: PresetInfo[] = [];
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

        var presetPath = null;
        if (app.encoder.getPresetPathByName) {
          try {
            presetPath = app.encoder.getPresetPathByName(presetName);
          } catch (error) {
            presetPath = null;
          }
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

export const getEncoderStatus = () => {
  var status: any = {
    hasEncoder: false,
    hasGetExporters: false,
    hasGetPresetPathByName: false,
    canLaunch: false,
    exportersCount: null,
    error: null,
  };

  try {
    status.hasEncoder = !!app.encoder;
    status.hasGetExporters = !!(app.encoder && app.encoder.getExporters);
    status.hasGetPresetPathByName = !!(
      app.encoder && app.encoder.getPresetPathByName
    );
    status.canLaunch = !!(app.encoder && app.encoder.launchEncoder);
  } catch (errorCaps) {}

  try {
    if (app.encoder && app.encoder.launchEncoder) {
      app.encoder.launchEncoder();
    }
  } catch (errorLaunch) {}

  try {
    if (app.encoder && app.encoder.getExporters) {
      var exporters = app.encoder.getExporters();
      status.exportersCount = exporters ? exporters.length : 0;
    }
  } catch (errorExporters) {
    status.error = errorExporters.toString();
  }

  return status;
};

export const resolvePresetPath = (presetName: string) => {
  if (!app.encoder || !app.encoder.getPresetPathByName) {
    return { error: "Preset lookup not available." };
  }
  try {
    var path = app.encoder.getPresetPathByName(presetName);
    return { path: path || null };
  } catch (error) {
    return { error: "Preset not found." };
  }
};

export const getLastExportFolder = () => {
  if (!app.encoder || !app.encoder.lastExportMediaFolder) {
    return { path: null };
  }
  try {
    var folder = app.encoder.lastExportMediaFolder();
    return { path: folder || null };
  } catch (error) {
    return { path: null };
  }
};

export const selectOutputFolder = () => {
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

export const getSequenceSummary = () => {
  var activeName = null;
  var selectedCount = 0;
  try {
    if (app.project && app.project.activeSequence) {
      activeName = app.project.activeSequence.name || null;
    }
  } catch (errorActive) {}

  try {
    var selection = getSelectedSequences();
    selectedCount = selection.length;
  } catch (errorSelection) {}

  return {
    activeSequenceName: activeName,
    selectedCount: selectedCount,
  };
};

export const queueExport = (payload: QueuePayload) => {
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

  var sequences = getSelectedSequences();
  if (!sequences.length) {
    return { error: "No active or selected sequences." };
  }

  var queued = 0;
  var errors: string[] = [];

  for (var i = 0; i < sequences.length; i++) {
    var seq = sequences[i];
    var seqName = seq && seq.name ? seq.name : "Sequence";
    var baseName = sanitizeSegment(seqName);
    if (sequences.length > 1) {
      baseName = baseName + "_" + (i + 1);
    }
    var filename = ensureExtension(baseName, payload.extension);
    var outputFile = new File(folder.fsName + "/" + filename);

    if (queueEncode(seq, outputFile.fsName, payload.presetPath)) {
      queued++;
    } else {
      errors.push(seqName);
    }
  }

  return { queued: queued, errors: errors };
};

export const queueSelectedClips = (payload: QueuePayload) => {
  if (!payload || !payload.presetPath) {
    return { error: "Preset not set." };
  }
  if (!payload.outputPath) {
    return { error: "Output destination missing." };
  }

  var sequence = getActiveSequence();
  if (!sequence) {
    return { error: "No active sequence." };
  }

  var clips = uniqueClips(getSelectedClips(sequence));
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

  var originalInOut = getSequenceInOut(sequence);
  var queued = 0;

  for (var i = 0; i < clips.length; i++) {
    var clip = clips[i];
    var clipName = clip.name || (clip.projectItem ? clip.projectItem.name : "Clip");
    var baseName = sanitizeSegment((sequence.name || "Sequence") + "_" + clipName + "_" + (i + 1));
    var filename = ensureExtension(baseName, payload.extension);
    var outputFile = new File(folder.fsName + "/" + filename);

    var startTicks = clip.start ? clip.start.ticks : 0;
    var endTicks = clip.end ? clip.end.ticks : 0;
    setSequenceInOut(sequence, startTicks, endTicks);

    if (queueEncode(sequence, outputFile.fsName, payload.presetPath, app.encoder.ENCODE_IN_TO_OUT)) {
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

// Re-export Claude's functions so they're available via the ppro namespace
export {
  claude_debugPreset,
  claude_listPresetDirs,
  claude_scanUserPresets,
  claude_getAvailablePresets,
  claude_selectOutputFolder,
  claude_getSequenceSummary,
  claude_getProjectDirectory,
  claude_getProjectName,
  claude_renameSelectedClips,
  claude_queueExport,
  claude_queueSelectedClips,
  claude_exportDirect,
  claude_exportSelectedClipsDirect,
  claude_getQueueInfo,
  claude_exportQueueItem,
  claude_queueBatchToAME,
  claude_getEditPoints,
  claude_getTrackVisibility,
  claude_setTrackVisibility,
  claude_getMarkerInfo,
  claude_getMarkerQueueInfo,
  claude_exportFrameJPEG,
  claude_validatePresetPath,
} from "./claude-ppro";
