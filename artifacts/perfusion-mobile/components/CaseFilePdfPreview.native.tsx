import { useColors } from "@/hooks/useColors";
import { ActivityIndicator, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

export default function CaseFilePdfPreview({
  url,
  onError,
}: {
  url: string;
  onError: () => void;
}) {
  const palette = useColors();
  return (
    <WebView
      source={{ uri: url }}
      originWhitelist={["https://*"]}
      setSupportMultipleWindows={false}
      startInLoadingState
      renderLoading={() => <ActivityIndicator style={styles.loading} color={palette.conversationPrimary} />}
      onError={onError}
      onHttpError={onError}
      style={[styles.viewer, { backgroundColor: palette.background }]}
    />
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1 },
  loading: { position: "absolute", top: "50%", left: "50%" },
});