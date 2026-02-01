<script lang="ts">
  import { onMount } from "svelte";
  import "../index.scss";
  import "./main.scss";
  import { evalTS, evalFile, csi } from "../lib/utils/bolt";
  import { fs } from "../lib/cep/node";

  type PresetSlot = {
    name: string;
    path: string;
    exporter?: string;
  };

  type PresetListItem = {
    name: string;
    matchName?: string;
    path?: string;
    exporter?: string;
  };

  let presetSlots: PresetSlot[] = $state([
    { name: "", path: "" },
    { name: "", path: "" },
    { name: "", path: "" },
  ]);

  let outputDir: string = $state("");
  let recentDirs: string[] = $state([]);
  let exportSelectedClips: boolean = $state(false);
  let statusSummary: string = $state("Ready");
  let logOpen: boolean = $state(false);
  let logLines: string[] = $state([]);
  let logTextarea: HTMLTextAreaElement | null = null;
  let activeSequenceName: string | null = $state(null);
  let selectedSequenceCount: number = $state(0);

  let presetModalOpen: boolean = $state(false);
  let presetSearch: string = $state("");
  let presetList: PresetListItem[] = $state([]);
  let presetTargetIndex: number | null = $state(null);
  let presetLoading: boolean = $state(false);

  const log = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    logLines = [...logLines, `[${timestamp}] ${message}`];
    statusSummary = message;
  };

  const saveSettings = () => {
    localStorage.setItem("exporter.presetSlots", JSON.stringify(presetSlots));
    localStorage.setItem("exporter.outputDir", outputDir || "");
    localStorage.setItem("exporter.recentDirs", JSON.stringify(recentDirs));
    localStorage.setItem("exporter.exportSelectedClips", JSON.stringify(exportSelectedClips));
  };

  const loadSettings = () => {
    try {
      const storedPresets = JSON.parse(localStorage.getItem("exporter.presetSlots") || "[]");
      if (Array.isArray(storedPresets) && storedPresets.length === 3) {
        presetSlots = storedPresets;
      }
    } catch (error) {}

    const storedOutput = localStorage.getItem("exporter.outputDir");
    if (storedOutput) {
      outputDir = storedOutput;
    }

    try {
      const storedRecent = JSON.parse(localStorage.getItem("exporter.recentDirs") || "[]");
      if (Array.isArray(storedRecent)) {
        recentDirs = storedRecent;
      }
    } catch (error) {}

    try {
      const storedSelected = JSON.parse(
        localStorage.getItem("exporter.exportSelectedClips") || "false"
      );
      exportSelectedClips = !!storedSelected;
    } catch (error) {}
  };

  const refreshSequenceSummary = async () => {
    try {
      const result = await evalTS("getSequenceSummary");
      activeSequenceName = result?.activeSequenceName || null;
      selectedSequenceCount = result?.selectedCount || 0;
    } catch (error) {
      activeSequenceName = null;
      selectedSequenceCount = 0;
    }
  };

  const ensureOutputDir = async () => {
    if (outputDir) {
      return true;
    }
    await chooseOutputDir();
    return !!outputDir;
  };

  const updateRecentDirs = (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) {
      return;
    }
    const next = [trimmed, ...recentDirs.filter((item) => item !== trimmed)].slice(0, 5);
    recentDirs = next;
    saveSettings();
  };

  const chooseOutputDir = async () => {
    try {
      const result = await evalTS("selectOutputFolder");
      if (result?.error) {
        log(result.error);
        return;
      }
      if (result?.canceled) {
        log("Folder selection canceled.");
        return;
      }
      if (result?.path) {
        outputDir = result.path;
        updateRecentDirs(result.path);
        log(`Output set to ${result.path}`);
      }
    } catch (error) {
      const message =
        (error && (error.message || error.toString())) ||
        "Unable to open folder dialog.";
      log(message);
    }
  };

  const setOutputDir = (path: string) => {
    outputDir = path;
    updateRecentDirs(path);
  };

  const openPresetModal = async (index: number) => {
    presetTargetIndex = index;
    presetModalOpen = true;
    presetSearch = "";
    if (!presetList.length) {
      await loadPresetList();
    }
  };

  const closePresetModal = () => {
    presetModalOpen = false;
    presetTargetIndex = null;
  };

  const loadPresetList = async () => {
    presetLoading = true;
    try {
      const result = await evalTS("getAvailablePresets");
      if (result?.error) {
        log(result.error);
        presetList = [];
      } else if (result?.presets && Array.isArray(result.presets)) {
        presetList = result.presets.sort((a: PresetListItem, b: PresetListItem) =>
          (a.name || "").localeCompare(b.name || "")
        );
      } else {
        presetList = [];
      }
    } catch (error) {
      presetList = [];
      const message =
        (error && (error.message || error.toString())) ||
        (typeof error === "string" ? error : JSON.stringify(error)) ||
        "Unable to load presets from Adobe Media Encoder.";
      log(message);
    } finally {
      presetLoading = false;
    }
  };

  const runDiagnostics = async () => {
    try {
      const result = await evalTS("getEncoderStatus");
      log(`Encoder status: ${JSON.stringify(result)}`);
    } catch (error) {
      const message =
        (error && (error.message || error.toString())) ||
        (typeof error === "string" ? error : JSON.stringify(error)) ||
        "Diagnostics failed.";
      log(message);
    }
  };

  const reloadExtendScript = () => {
    try {
      const extRoot = csi.getSystemPath("extension");
      const jsxSrc = `${extRoot}/jsx/index.js`;
      const jsxBinSrc = `${extRoot}/jsx/index.jsxbin`;
      if (fs.existsSync(jsxSrc)) {
        evalFile(jsxSrc);
        log("ExtendScript reloaded from index.js");
      } else if (fs.existsSync(jsxBinSrc)) {
        evalFile(jsxBinSrc);
        log("ExtendScript reloaded from index.jsxbin");
      } else {
        log("ExtendScript bundle not found.");
      }
    } catch (error) {
      const message =
        (error && (error.message || error.toString())) ||
        (typeof error === "string" ? error : JSON.stringify(error)) ||
        "Unable to reload ExtendScript.";
      log(message);
    }
  };

  const assignPreset = async (preset: PresetListItem) => {
    if (presetTargetIndex === null) {
      return;
    }
    let presetPath = preset.path || "";
    if (!presetPath && preset.name) {
      try {
        const resolved = await evalTS("resolvePresetPath", preset.name);
        if (resolved?.path) {
          presetPath = resolved.path;
        }
      } catch (error) {}
    }

    if (!presetPath) {
      log("Preset path not found. Try another preset.");
      return;
    }

    const nextSlots = [...presetSlots];
    nextSlots[presetTargetIndex] = {
      name: preset.name,
      path: presetPath,
      exporter: preset.exporter,
    };
    presetSlots = nextSlots;
    saveSettings();
    log(`Preset ${presetTargetIndex + 1} assigned to ${preset.name}.`);
    closePresetModal();
  };

  const clearPreset = (index: number) => {
    const nextSlots = [...presetSlots];
    nextSlots[index] = { name: "", path: "" };
    presetSlots = nextSlots;
    saveSettings();
  };

  const queueExport = async (index: number) => {
    const slot = presetSlots[index];
    if (!slot || !slot.path) {
      await openPresetModal(index);
      return;
    }

    const hasDir = await ensureOutputDir();
    if (!hasDir) {
      log("Select an output folder first.");
      return;
    }

    try {
      const payload = {
        presetPath: slot.path,
        outputPath: outputDir,
        exportSelectedClips,
      };
      const result = exportSelectedClips
        ? await evalTS("queueSelectedClips", payload)
        : await evalTS("queueExport", payload);

      if (result?.error) {
        log(result.error);
        return;
      }

      if (exportSelectedClips) {
        log(`Queued ${result?.queued || 0} clip exports.`);
      } else {
        const errors = result?.errors || [];
        if (errors.length) {
          log(`Queued ${result?.queued || 0} sequences. Failed: ${errors.join(", ")}`);
        } else {
          log(`Queued ${result?.queued || 0} sequences.`);
        }
      }
      await refreshSequenceSummary();
    } catch (error) {
      log("Export failed. Check the console for details.");
    }
  };

  const toggleLog = () => {
    logOpen = !logOpen;
  };

  const copyLog = async () => {
    const text = logLines.join("\n");
    if (!text) {
      return;
    }
    const fallbackCopy = () => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (ok) {
        log("Log copied to clipboard.");
      } else {
        log("Clipboard not available.");
      }
    };
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        log("Log copied to clipboard.");
      } else {
        fallbackCopy();
      }
    } catch (error) {
      fallbackCopy();
    }
  };

  const selectLog = () => {
    if (!logTextarea) {
      return;
    }
    logTextarea.focus();
    logTextarea.select();
  };

  const filteredPresets = () => {
    const term = presetSearch.trim().toLowerCase();
    if (!term) {
      return presetList;
    }
    return presetList.filter((preset) =>
      (preset.name || "").toLowerCase().includes(term)
    );
  };

  const bootstrap = async () => {
    loadSettings();
    try {
      const lastFolder = await evalTS("getLastExportFolder");
      if (!outputDir && lastFolder?.path) {
        outputDir = lastFolder.path;
        updateRecentDirs(lastFolder.path);
      }
    } catch (error) {}
    await refreshSequenceSummary();
  };

  onMount(() => {
    bootstrap();
  });
</script>

<div class="fixed-header">
  <div class="header-left">
    <h1>Exporter</h1>
    <span class="header-separator">|</span>
    <span class="header-info">
      {#if activeSequenceName}
        Active: {activeSequenceName}
      {:else}
        No active sequence
      {/if}
    </span>
    <span class="header-separator">|</span>
    <span class="header-info">
      {selectedSequenceCount} selected
    </span>
  </div>
  <div class="header-right">
    <button
      class="icon-button"
      title="Refresh"
      aria-label="Refresh sequence summary"
      onclick={refreshSequenceSummary}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path
          d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"
        />
        <path
          fill-rule="evenodd"
          d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 4.9 4c1.552 0 2.94-.707 3.857-1.818a.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"
        />
      </svg>
    </button>
  </div>
</div>

<div class="container">
  <div class="main-panel">
    <div class="content">
      <div class="pane">
        <div class="inline-row">
          <div class="inline-title">
            <span>Presets</span>
            <span class="info-icon" title="Assign up to three Media Encoder presets.">i</span>
          </div>
        </div>
        <div class="preset-grid">
          {#each presetSlots as slot, index}
            <div class="preset-card">
              <button class="preset-button" onclick={() => queueExport(index)}>
                <div class="preset-name">{slot.name || `Preset ${index + 1}`}</div>
                <div class="preset-subtitle">
                  {slot.name ? "Click to export" : "Assign a Media Encoder preset"}
                </div>
              </button>
              <div class="preset-actions">
                <button class="action-button small" onclick={() => openPresetModal(index)}>
                  Assign
                </button>
                {#if slot.name}
                  <button class="secondary-button small" onclick={() => clearPreset(index)}>
                    Clear
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="pane">
        <div class="inline-row">
          <div class="inline-title">
            <span>Output Destination</span>
            <span class="info-icon" title="Choose where exports will be saved.">i</span>
          </div>
          <div class="inline-actions">
            <button class="action-button" onclick={chooseOutputDir}>Set Folder</button>
          </div>
        </div>
        <div class="output-path">{outputDir || "No output folder selected"}</div>
        {#if recentDirs.length}
          <div class="recent-row">
            {#each recentDirs as dir}
              <button class="recent-chip" onclick={() => setOutputDir(dir)}>{dir}</button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="pane">
        <div class="inline-row">
          <div class="inline-title">
            <span>Export Options</span>
          </div>
        </div>
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={exportSelectedClips} onchange={saveSettings} />
          <span>Export selected clips (auto set In/Out around selection)</span>
        </label>
        <p class="muted">
          When enabled, Exporter will queue each selected clip from the active sequence.
        </p>
      </div>
    </div>
  </div>
</div>

<div class="fixed-footer">
  <div class="footer-content">
    <div class="footer-left">
      <span class="footer-label">{statusSummary}</span>
    </div>
    <div class="footer-right">
      <button
        class={`icon-button ${logOpen ? "log-active" : ""}`}
        title="Toggle detailed log"
        aria-label="Toggle detailed log"
        onclick={toggleLog}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"
          />
        </svg>
      </button>
    </div>
  </div>
</div>

<div class={`log-drawer ${logOpen ? "open" : ""}`}>
  <div class="log-drawer-content">
    <div class="log-drawer-header">
      <span>Detailed Log</span>
      <button class="icon-button" title="Copy log" aria-label="Copy log" onclick={copyLog}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"
          />
          <path
            d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"
          />
        </svg>
      </button>
      <button class="action-button small" onclick={selectLog}>Select</button>
    </div>
    <textarea
      class="log-content log-textarea"
      bind:this={logTextarea}
      readonly
      value={logLines.join("\n")}
    ></textarea>
  </div>
</div>

{#if presetModalOpen}
  <div class="modal" role="dialog" aria-modal="true" onclick={closePresetModal}>
    <div class="modal-content" onclick={(event) => event.stopPropagation()}>
      <h2>Select Preset</h2>
      <p class="modal-subtitle">Choose a Media Encoder preset (including your custom ones).</p>
      <input
        type="text"
        class="search-input"
        placeholder="Search presets..."
        bind:value={presetSearch}
      />
      <div class="list-items">
        {#if presetLoading}
          <div class="list-item muted">Loading presets...</div>
        {:else if filteredPresets().length === 0}
          <div class="list-item muted">No presets found.</div>
        {:else}
          {#each filteredPresets() as preset}
            <button class="list-item" onclick={() => assignPreset(preset)}>
              <div class="list-item-title">{preset.name}</div>
              {#if preset.exporter}
                <div class="list-item-subtitle">{preset.exporter}</div>
              {/if}
            </button>
          {/each}
        {/if}
      </div>
      <div class="modal-actions">
        <button class="secondary-button" onclick={closePresetModal}>Cancel</button>
        <button class="action-button" onclick={loadPresetList}>Refresh presets</button>
        <button class="action-button" onclick={runDiagnostics}>Diagnostics</button>
        <button class="action-button" onclick={reloadExtendScript}>Reload JSX</button>
      </div>
    </div>
  </div>
{/if}
