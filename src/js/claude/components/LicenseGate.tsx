import React, { useState } from "react";
import { csi } from "../../lib/utils/bolt";

interface LicenseGateProps {
  onActivate: (key: string) => Promise<{ success: boolean; error?: string }>;
  isActivating: boolean;
}

const LicenseGate: React.FC<LicenseGateProps> = ({ onActivate, isActivating }) => {
  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleActivate = async () => {
    setError(null);
    const result = await onActivate(licenseKey);
    if (!result.success) {
      setError(result.error || "Activation failed");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isActivating && licenseKey.trim()) {
      handleActivate();
    }
  };

  return (
    <div className="license-gate">
      <div className="license-gate-content">
        <h1 className="license-gate-logo">Exporter</h1>
        <p className="license-gate-subtitle">Enter your license key to get started</p>
        <div className="license-gate-form">
          <input
            type="text"
            className="license-gate-input"
            placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isActivating}
            autoFocus
          />
          <button
            className="button button--primary license-gate-button"
            onClick={handleActivate}
            disabled={isActivating || !licenseKey.trim()}
          >
            {isActivating ? "Activating..." : "Activate"}
          </button>
        </div>
        {error && <p className="license-gate-error">{error}</p>}
        <p className="license-gate-footer">
          <span
            className="license-gate-link"
            onClick={() => csi.openURLInDefaultBrowser("https://dahm.lemonsqueezy.com/checkout/buy/18fce3fc-96bc-4a75-b478-1fd55a4ba176")}
          >
            Get a license
          </span>
        </p>
      </div>
    </div>
  );
};

export default LicenseGate;
