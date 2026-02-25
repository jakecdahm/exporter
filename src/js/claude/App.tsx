import React, { useState, useCallback, useEffect } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import PresetButton from "./components/PresetButton";
import DirectorySelector from "./components/DirectorySelector";
import ExportOptions from "./components/ExportOptions";
import PresetModal from "./components/PresetModal";
import QueuePanel from "./components/QueuePanel";
import InfoModal from "./components/InfoModal";
import SettingsModal from "./components/SettingsModal";
import LicenseGate from "./components/LicenseGate";
import UpdateBanner from "./components/UpdateBanner";
import { useSettings } from "./hooks/useSettings";
import { useExport } from "./hooks/useExport";
import { useQueue } from "./hooks/useQueue";
import { useSavedQueues } from "./hooks/useSavedQueues";
import { useLicense } from "./hooks/useLicense";
import { useUpdateChecker } from "./hooks/useUpdateChecker";
import { DEFAULT_TEMPLATE_CLIPS, DEFAULT_TEMPLATE_SEQUENCES, DEFAULT_TEMPLATE_MARKERS } from "./utils/filenameTokens";
import { csi, evalES } from "../lib/utils/bolt";
import { fs } from "../lib/cep/node";

export interface LogMessage {
  timestamp: Date;
  type: "info" | "success" | "error" | "warning";
  message: string;
}

export interface PresetInfo {
  name: string;
  matchName?: string;
  path?: string;
  exporter?: string;
}

export interface PresetAssignment {
  name: string;
  path: string;
  displayName: string;
}

export interface TrackVisibility {
  videoClips: boolean[][];
  audioClips: boolean[][];
  videoTrackMutes: number[];
  audioTrackMutes: number[];
}

export interface QueueItem {
  id: string;
  sequenceName: string;
  clipName?: string;
  clipIndex?: number;
  startTicks?: number;
  endTicks?: number;
  preset: PresetAssignment;
  outputPath: string;
  expectedFilename: string;
  useInOut?: boolean;
  trackVisibility?: TrackVisibility;
  status: "pending" | "exporting" | "completed" | "failed";
  markerName?: string;
  markerTicks?: number;
  colorIndex?: number;
  isStillExport?: boolean;
}

export const STILL_EXPORT_PRESET: PresetAssignment = {
  name: "JPEG Frame",
  path: "__still_export__",
  displayName: "JPEG Frame",
};

const App: React.FC = () => {
  const { licenseStatus, activate, deactivate, isActivating } = useLicense();
  const { updateAvailable, dismissUpdate } = useUpdateChecker(licenseStatus === "valid");
  const { settings, updateSettings } = useSettings();
  const { savedQueues, saveCurrentQueue, deleteQueue, clearSavedQueues } = useSavedQueues();
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [infoModalTab, setInfoModalTab] = useState<"logs" | "history">("logs");
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [activePresetSlot, setActivePresetSlot] = useState<1 | 2 | 3 | 4 | 5 | null>(null);

  const addLog = useCallback((type: LogMessage["type"], message: string) => {
    setLogs((prev) => [...prev, { timestamp: new Date(), type, message }]);
  }, []);

  // Check ExtendScript namespace on mount (silent unless error)
  useEffect(() => {
    const hasCep = !!(window.cep || (window as any).__adobe_cep__);
    if (!hasCep) return;

    const extRoot = csi.getSystemPath("extension");
    const jsxPath = `${extRoot}/jsx/index.js`;
    if (!fs.existsSync(jsxPath)) {
      addLog("error", "ExtendScript not found");
      return;
    }

    // Silently verify namespace exists
    csi.evalScript(
      `try {
        var host = typeof $ !== 'undefined' ? $ : window;
        JSON.stringify({ nsExists: !!host["com.jakedahm.exporter"] });
      } catch(e) { JSON.stringify({ error: e.message }); }`,
      (res: string) => {
        try {
          const parsed = JSON.parse(res);
          if (parsed.error || !parsed.nsExists) {
            addLog("error", "ExtendScript failed to load");
          }
        } catch { }
      }
    );
  }, [addLog]);

  const { handleExport, availablePresets, loadPresets } = useExport({
    settings,
    addLog,
    setIsExporting,
    setExportProgress,
    setStatusMessage,
  });

  const {
    queue,
    addToQueue,
    addAndExport,
    addStillsToQueue,
    removeFromQueue,
    clearQueue,
    exportAllDirect,
    queueAllToAME,
    isProcessing,
    loadSavedQueueItems,
  } = useQueue({
    settings,
    addLog,
    setIsExporting,
    setExportProgress,
    setStatusMessage,
  });

  const handlePresetClick = (slot: 1 | 2 | 3 | 4 | 5) => {
    const preset = settings.presets[`slot${slot}` as keyof typeof settings.presets];
    if (preset) {
      addToQueue(preset);
    } else {
      setActivePresetSlot(slot);
      setPresetModalOpen(true);
    }
  };

  const handleExportNow = (slot: 1 | 2 | 3 | 4 | 5) => {
    const preset = settings.presets[`slot${slot}` as keyof typeof settings.presets];
    if (preset) {
      addAndExport(preset);
    }
  };

  const handlePresetClear = (slot: 1 | 2 | 3 | 4 | 5) => {
    updateSettings({
      presets: {
        ...settings.presets,
        [`slot${slot}`]: null,
      },
    });
    addLog("info", `Preset ${slot} cleared`);
  };

  const handlePresetAssign = (slot: 1 | 2 | 3 | 4 | 5) => {
    setActivePresetSlot(slot);
    setPresetModalOpen(true);
  };

  const handlePresetSelect = (preset: PresetInfo) => {
    if (activePresetSlot) {
      const assignment: PresetAssignment = {
        name: preset.name,
        path: preset.path || "",
        displayName: preset.name,
      };
      updateSettings({
        presets: {
          ...settings.presets,
          [`slot${activePresetSlot}`]: assignment,
        },
      });
      setPresetModalOpen(false);
      setActivePresetSlot(null);
      addLog("info", `Preset ${activePresetSlot}: ${preset.name}`);
    }
  };

  const handleDirectoryChange = (dirPath: string) => {
    const recentDirs = [dirPath, ...settings.recentDirectories.filter((d) => d !== dirPath)].slice(0, 5);
    updateSettings({ outputDirectory: dirPath, recentDirectories: recentDirs });
    const folderName = dirPath.split(/[/\\]/).pop() || dirPath;
    addLog("info", `Path set to /${folderName}`);
  };

  if (licenseStatus === "loading") {
    return <div className="app"><div className="loading-screen">Loading...</div></div>;
  }

  if (licenseStatus !== "valid") {
    return (
      <div className="app">
        <LicenseGate onActivate={activate} isActivating={isActivating} />
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        onRefresh={loadPresets}
        onHistoryClick={() => { setInfoModalTab("history"); setInfoModalOpen(true); }}
        onSettingsClick={() => setSettingsModalOpen(true)}
        exportType={settings.exportType}
        onExportTypeChange={(value) => {
          const defaultTemplate = value === "clips" ? DEFAULT_TEMPLATE_CLIPS : value === "sequences" ? DEFAULT_TEMPLATE_SEQUENCES : DEFAULT_TEMPLATE_MARKERS;
          updateSettings({ exportType: value, filenameTemplate: defaultTemplate });
        }}
      />

      <main className="main-content">
        {updateAvailable && (
          <UpdateBanner info={updateAvailable} onDismiss={dismissUpdate} />
        )}
        <section className="section">
          <DirectorySelector
            currentPath={settings.outputDirectory}
            recentPaths={settings.recentDirectories}
            onChange={handleDirectoryChange}
          />
        </section>

        <section className="section">
          <ExportOptions
            filenameTemplate={settings.filenameTemplate}
            onFilenameTemplateChange={(template) => updateSettings({ filenameTemplate: template })}
            onLog={addLog}
            exportType={settings.exportType}
            markerSubMode={settings.markerSubMode}
            onMarkerSubModeChange={(mode) => updateSettings({ markerSubMode: mode })}
            markerSecondsBefore={settings.markerSecondsBefore}
            markerSecondsAfter={settings.markerSecondsAfter}
            onMarkerSecondsBeforeChange={(sec) => updateSettings({ markerSecondsBefore: sec })}
            onMarkerSecondsAfterChange={(sec) => updateSettings({ markerSecondsAfter: sec })}
            markerColorFilter={settings.markerColorFilter}
            onMarkerColorFilterChange={(colors) => updateSettings({ markerColorFilter: colors })}
          />
        </section>

        {settings.exportType === "markers" && settings.markerSubMode === "stills" ? (
          <section className="section">
            <button
              className="button button--primary"
              onClick={() => addStillsToQueue()}
              disabled={!settings.outputDirectory}
            >
              Queue Marker Stills
            </button>
          </section>
        ) : (
          <section className="section">
            <div className="preset-buttons">
              <PresetButton
                slot={1}
                preset={settings.presets.slot1}
                onClick={() => handlePresetClick(1)}
                onAssign={() => handlePresetAssign(1)}
                onExportNow={() => handleExportNow(1)}
                onClear={() => handlePresetClear(1)}
              />
              <PresetButton
                slot={2}
                preset={settings.presets.slot2}
                onClick={() => handlePresetClick(2)}
                onAssign={() => handlePresetAssign(2)}
                onExportNow={() => handleExportNow(2)}
                onClear={() => handlePresetClear(2)}
              />
              <PresetButton
                slot={3}
                preset={settings.presets.slot3}
                onClick={() => handlePresetClick(3)}
                onAssign={() => handlePresetAssign(3)}
                onExportNow={() => handleExportNow(3)}
                onClear={() => handlePresetClear(3)}
              />
              <PresetButton
                slot={4}
                preset={settings.presets.slot4}
                onClick={() => handlePresetClick(4)}
                onAssign={() => handlePresetAssign(4)}
                onExportNow={() => handleExportNow(4)}
                onClear={() => handlePresetClear(4)}
              />
              <PresetButton
                slot={5}
                preset={settings.presets.slot5}
                onClick={() => handlePresetClick(5)}
                onAssign={() => handlePresetAssign(5)}
                onExportNow={() => handleExportNow(5)}
                onClear={() => handlePresetClear(5)}
              />
            </div>
          </section>
        )}

        <QueuePanel
          queue={queue}
          onRemove={removeFromQueue}
          onClear={clearQueue}
          onSaveQueue={() => {
            saveCurrentQueue(queue);
            addLog("info", "Queue saved");
          }}
          isProcessing={isProcessing}
        />
      </main>

      <Footer
        isExporting={isExporting}
        progress={exportProgress}
        status={isExporting ? statusMessage : (logs.length > 0 ? logs[logs.length - 1].message : "Ready")}
        queueCount={queue.filter((q) => q.status === "pending").length}
        exportMethod={settings.exportMethod}
        onExportMethodChange={(method) => updateSettings({ exportMethod: method })}
        onExport={() => {
          if (settings.exportMethod === "direct") {
            exportAllDirect();
          } else {
            queueAllToAME();
          }
        }}
        onLogClick={() => { setInfoModalTab("logs"); setInfoModalOpen(true); }}
      />

      {presetModalOpen && (
        <PresetModal
          presets={availablePresets}
          onSelect={handlePresetSelect}
          onClose={() => {
            setPresetModalOpen(false);
            setActivePresetSlot(null);
          }}
          onRefresh={loadPresets}
        />
      )}

      {infoModalOpen && (
        <InfoModal
          activeTab={infoModalTab}
          onTabChange={setInfoModalTab}
          onClose={() => setInfoModalOpen(false)}
          logs={logs}
          savedQueues={savedQueues}
          onLoadQueue={(sq) => {
            loadSavedQueueItems(sq.items);
            setInfoModalOpen(false);
          }}
          onDeleteQueue={deleteQueue}
          onClearQueues={clearSavedQueues}
        />
      )}

      {settingsModalOpen && (
        <SettingsModal
          logEnabled={settings.logEnabled}
          logDirectory={settings.logDirectory}
          exportCutsJson={settings.exportCutsJson}
          onLogEnabledChange={(enabled) => updateSettings({ logEnabled: enabled })}
          onLogDirectoryChange={(path) => updateSettings({ logDirectory: path })}
          onExportCutsJsonChange={(enabled) => updateSettings({ exportCutsJson: enabled })}
          onDeactivate={deactivate}
          isDeactivating={isActivating}
          onClose={() => setSettingsModalOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
