import React from "react";
import { WebView } from "react-native-webview";

export function CallMedia({ url, onError }: { url: string; onError: () => void }) {
  return (
    <WebView
      source={{ uri: url }}
      style={{ flex: 1, backgroundColor: "#0A0A0A" }}
      javaScriptEnabled
      domStorageEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
      setSupportMultipleWindows={false}
      onError={onError}
      onHttpError={onError}
      testID="in-app-call-room"
    />
  );
}