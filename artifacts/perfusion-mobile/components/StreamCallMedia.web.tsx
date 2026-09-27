import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function StreamCallMedia() {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Native Stream calls are supported in the installed iOS or Android app.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#0A0A0A",
  },
  label: {
    color: "#FFFFFF",
    fontSize: 16,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
  },
});