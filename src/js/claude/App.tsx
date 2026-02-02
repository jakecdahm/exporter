import React, { useState, useCallback, useEffect } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import LogDrawer from "./components/LogDrawer";
import PresetButton from "./components/PresetButton";
import DirectorySelector from "./components/DirectorySelector";
import ExportOptions from "./components/ExportOptions";
import PresetModal from "./components/PresetModal";
import QueuePanel from "./components/QueuePanel";
import { useSettings } from "./hooks/useSettings";
import { useExport } from "./hooks/useExport";
import { useQueue } from "./hooks/useQueue";
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
  status: "pending" | "exporting" | "completed" | "failed";
}

const App: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [isLogOpen, setIsLogOpen] = useState(false);
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
    removeFromQueue,
    clearQueue,
    exportAllDirect,
    queueAllToAME,
    isProcessing,
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
      // Add to queue instead of exporting immediately
      addToQueue(preset);
    } else {
      setActivePresetSlot(slot);
      setPresetModalOpen(true);
    }
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

  const handleDirectoryChange = (path: string) => {
    const recentDirs = [path, ...settings.recentDirectories.filter((d) => d !== path)].slice(0, 5);
    updateSettings({ outputDirectory: path, recentDirectories: recentDirs });
    addLog("info", `Output: ${path}`);
  };

  return (
    <div className="app">
      <Header onRefresh={loadPresets} />

      <main className="main-content">
        <section className="section">
          <div className="section-label">Output Directory</div>
          <DirectorySelector
            currentPath={settings.outputDirectory}
            recentPaths={settings.recentDirectories}
            onChange={handleDirectoryChange}
          />
        </section>

        <section className="section">
          <div className="section-label">Options</div>
          <ExportOptions
            exportType={settings.exportType}
            onExportTypeChange={(value) => updateSettings({ exportType: value })}
            filenameTemplate={settings.filenameTemplate}
            onFilenameTemplateChange={(template) => updateSettings({ filenameTemplate: template })}
          />
        </section>

        <section className="section">
          <div className="section-label">Export Presets</div>
          <div className="preset-buttons">
            <PresetButton
              slot={1}
              preset={settings.presets.slot1}
              onClick={() => handlePresetClick(1)}
              onAssign={() => handlePresetAssign(1)}
            />
            <PresetButton
              slot={2}
              preset={settings.presets.slot2}
              onClick={() => handlePresetClick(2)}
              onAssign={() => handlePresetAssign(2)}
            />
            <PresetButton
              slot={3}
              preset={settings.presets.slot3}
              onClick={() => handlePresetClick(3)}
              onAssign={() => handlePresetAssign(3)}
            />
            <PresetButton
              slot={4}
              preset={settings.presets.slot4}
              onClick={() => handlePresetClick(4)}
              onAssign={() => handlePresetAssign(4)}
            />
            <PresetButton
              slot={5}
              preset={settings.presets.slot5}
              onClick={() => handlePresetClick(5)}
              onAssign={() => handlePresetAssign(5)}
            />
          </div>
        </section>

        <QueuePanel
          queue={queue}
          onRemove={removeFromQueue}
          onClear={clearQueue}
          isProcessing={isProcessing}
        />
      </main>

      <LogDrawer isOpen={isLogOpen} logs={logs} />

      <Footer
        isExporting={isExporting}
        progress={exportProgress}
        status={statusMessage}
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
        isLogOpen={isLogOpen}
        onToggleLog={() => setIsLogOpen(!isLogOpen)}
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
    </div>
  );
};

export default App;
