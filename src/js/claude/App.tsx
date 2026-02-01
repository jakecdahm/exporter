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
  const [isLogOpen, setIsLogOpen] = useState(true); // Start open to show diagnostics
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [activePresetSlot, setActivePresetSlot] = useState<1 | 2 | 3 | 4 | 5 | null>(null);

  const addLog = useCallback((type: LogMessage["type"], message: string) => {
    setLogs((prev) => [...prev, { timestamp: new Date(), type, message }]);
  }, []);

  // Run diagnostics on mount
  useEffect(() => {
    const runDiagnostics = async () => {
      const hasCep = !!(window.cep || (window as any).__adobe_cep__);
      addLog("info", `CEP Environment: ${hasCep ? "Yes" : "No"}`);

      if (hasCep) {
        try {
          const extRoot = csi.getSystemPath("extension");
          addLog("info", `Extension root: ${extRoot}`);

          const jsxPath = `${extRoot}/jsx/index.js`;
          const jsxExists = fs.existsSync(jsxPath);
          addLog("info", `JSX file exists: ${jsxExists}`);

          if (!jsxExists) {
            addLog("error", `JSX file NOT found at: ${jsxPath}`);
            // Try listing the jsx directory
            try {
              const jsxDir = `${extRoot}/jsx`;
              const dirResult = fs.readdirSync(jsxDir);
              addLog("info", `JSX dir contents: ${JSON.stringify(dirResult)}`);
            } catch (dirErr: any) {
              addLog("error", `Cannot read jsx dir: ${dirErr?.message || dirErr}`);
            }
          }

          // Test direct evalScript to check namespace
          addLog("info", "Testing ExtendScript namespace...");
          csi.evalScript(
            `try {
              var host = typeof $ !== 'undefined' ? $ : window;
              var ns = "com.jakedahm.exporter";
              JSON.stringify({
                hostExists: !!host,
                nsExists: !!host[ns],
                nsFunctions: host[ns] ? Object.keys(host[ns]).slice(0, 10) : [],
                appPath: typeof app !== 'undefined' && app.path ? app.path : 'N/A',
                bridgeTalk: typeof BridgeTalk !== 'undefined' ? BridgeTalk.appName : 'N/A'
              });
            } catch(e) {
              JSON.stringify({ error: e.message || String(e) });
            }`,
            (res: string) => {
              try {
                const parsed = JSON.parse(res);
                if (parsed.error) {
                  addLog("error", `Namespace check error: ${parsed.error}`);
                } else {
                  addLog("info", `Host exists: ${parsed.hostExists}`);
                  addLog("info", `Namespace exists: ${parsed.nsExists}`);
                  if (parsed.nsExists && parsed.nsFunctions.length > 0) {
                    addLog("success", `Functions available: ${parsed.nsFunctions.join(", ")}`);
                  } else if (!parsed.nsExists) {
                    addLog("error", "Namespace NOT found - ExtendScript may not have loaded");
                    addLog("info", `App path: ${parsed.appPath}`);
                    addLog("info", `BridgeTalk.appName: ${parsed.bridgeTalk}`);
                  }
                }
              } catch (parseErr) {
                addLog("error", `Parse error: ${res}`);
              }
            }
          );

          // Try to manually evaluate the JSX file if namespace doesn't exist
          setTimeout(() => {
            csi.evalScript(
              `try {
                var host = typeof $ !== 'undefined' ? $ : window;
                var ns = "com.jakedahm.exporter";
                JSON.stringify({ nsExists: !!host[ns] });
              } catch(e) { JSON.stringify({ error: e.message }); }`,
              (res: string) => {
                try {
                  const parsed = JSON.parse(res);
                  if (!parsed.nsExists && !parsed.error) {
                    addLog("warning", "Namespace still missing after 1s - attempting manual load");
                    const jsxPath2 = `${extRoot}/jsx/index.js`;
                    // Use raw evalScript with detailed error capture
                    const escapedPath = jsxPath2.replace(/\\/g, "/");
                    csi.evalScript(
                      `(function() {
                        try {
                          var f = new File("${escapedPath}");
                          if (!f.exists) {
                            return JSON.stringify({ error: "File does not exist: ${escapedPath}" });
                          }
                          var result = $.evalFile(f);
                          var host = typeof $ !== 'undefined' ? $ : window;
                          var ns = "com.jakedahm.exporter";
                          return JSON.stringify({
                            success: true,
                            evalResult: String(result),
                            nsExists: !!host[ns],
                            funcs: host[ns] ? Object.keys(host[ns]).length : 0
                          });
                        } catch(e) {
                          return JSON.stringify({
                            error: e.message || String(e),
                            line: e.line || 'unknown',
                            fileName: e.fileName || 'unknown'
                          });
                        }
                      })()`,
                      (res2: string) => {
                        try {
                          const p2 = JSON.parse(res2);
                          if (p2.error) {
                            addLog("error", `Load error: ${p2.error} (line: ${p2.line})`);
                          } else if (p2.success) {
                            addLog("info", `Load result: ${p2.evalResult}`);
                            if (p2.nsExists) {
                              addLog("success", `Namespace now available with ${p2.funcs} functions`);
                            } else {
                              addLog("error", "File loaded but namespace still not set");
                            }
                          }
                        } catch (parseErr) {
                          addLog("error", `Raw result: ${res2}`);
                        }
                      }
                    );
                  }
                } catch { }
              }
            );
          }, 1000);
        } catch (err: any) {
          addLog("error", `Diagnostic error: ${err?.message || err}`);
        }
      }
    };

    runDiagnostics();
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
      addLog("info", `Assigned "${preset.name}" to Preset ${activePresetSlot}`);
    }
  };

  const handleDirectoryChange = (path: string) => {
    const recentDirs = [path, ...settings.recentDirectories.filter((d) => d !== path)].slice(0, 5);
    updateSettings({ outputDirectory: path, recentDirectories: recentDirs });
    addLog("info", `Output directory set to: ${path}`);
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
            filenamePattern={settings.filenamePattern}
            customFilename={settings.customFilename}
            onExportTypeChange={(value) => updateSettings({ exportType: value })}
            onFilenamePatternChange={(value) => updateSettings({ filenamePattern: value })}
            onCustomFilenameChange={(value) => updateSettings({ customFilename: value })}
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
