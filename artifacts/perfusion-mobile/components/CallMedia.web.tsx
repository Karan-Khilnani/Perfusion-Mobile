import React from "react";

export function CallMedia({ url, onError }: { url: string; onError: () => void }) {
  return (
    <iframe
      title="Secure consultation call"
      src={url}
      allow="camera; microphone; autoplay; fullscreen; display-capture"
      allowFullScreen
      onError={onError}
      style={{ width: "100%", height: "100%", border: 0, display: "block", backgroundColor: "#0A0A0A" }}
      data-testid="in-app-call-room"
    />
  );
}