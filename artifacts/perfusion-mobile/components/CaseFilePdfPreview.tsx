import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export default function CaseFilePdfPreview(_props: { url: string; onError: () => void }) {
  const palette = useColors();
  return (
    <View style={styles.container}>
      <Feather name="file-text" size={34} color={palette.conversationPrimary} />
      <Text style={[styles.message, { color: palette.conversationPrimaryForeground }]}>
        PDF preview is available in the mobile app. Use the download icon to save the original file.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 28 },
  message: { maxWidth: 340, fontSize: 13, lineHeight: 20, textAlign: "center", fontFamily: "Inter_400Regular" },
});