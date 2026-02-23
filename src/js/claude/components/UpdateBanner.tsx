import React from "react";
import { csi } from "../../lib/utils/bolt";
import { UpdateInfo } from "../services/updateChecker";

interface UpdateBannerProps {
  info: UpdateInfo;
  onDismiss: () => void;
}

const UpdateBanner: React.FC<UpdateBannerProps> = ({ info, onDismiss }) => {
  return (
    <div className="update-banner">
      <span className="update-banner-text">
        v{info.latestVersion} available
      </span>
      <span
        className="update-banner-link"
        onClick={() => csi.openURLInDefaultBrowser(info.downloadUrl)}
      >
        Download
      </span>
      <button className="update-banner-dismiss" onClick={onDismiss} title="Dismiss">
        &times;
      </button>
    </div>
  );
};

export default UpdateBanner;
