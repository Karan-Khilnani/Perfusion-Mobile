import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { BrandMark } from "@/components/BrandMark";
import { ScreenHeading } from "@/components/ScreenHeading";
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { isSeekerRole } from "@/lib/mobile-models";

type Invoice = { id: string; invoiceNumber?: string; status?: string; totalAmount?: string | number; amount?: string | number; createdAt?: string; patientName?: string };

export default function BillingScreen() {
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const seeker = isSeekerRole(user?.role);
  const query = useQuery<Invoice[]>({
    queryKey: ["mobile-billing", user?.role],
    queryFn: async () => {
      const response = await apiFetch(seeker ? "/api/billing/my-invoices" : "/api/billing/provider-earnings");
      if (!response.ok) throw new Error("Unable to load billing");
      return response.json();
    },
    enabled: !!user?.role,
  });
  const items = Array.isArray(query.data) ? query.data : [];
  const completed = items.filter((item) => ["paid", "completed"].includes((item.status || "").toLowerCase())).length;
  const earned = items.reduce((sum, item) => sum + Number(item.totalAmount || item.amount || 0), 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={[styles.container, { paddingTop: Platform.OS === "web" ? 78 : insets.top + 20, paddingBottom: Platform.OS === "web" ? 125 : insets.bottom + 100 }]}
    >
      <View style={styles.brandRow}><BrandMark compact /></View>
      <ScreenHeading title="Billing" subtitle={seeker ? "Invoices and payment history" : "Consultation earnings and payouts"} />
      {!seeker && (
        <View style={styles.stats}>
          <Stat label="Completed" value={String(completed)} icon="check-circle" />
          <Stat label="Earned" value={`₹${earned.toLocaleString("en-IN")}`} icon="trending-up" />
          <Stat label="Paid" value={`₹${earned.toLocaleString("en-IN")}`} icon="credit-card" />
        </View>
      )}
      <Text style={[styles.sectionTitle, { color: palette.foreground }]}>{seeker ? "Your invoices" : "Transactions"}</Text>
      <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
        {query.isLoading ? <ActivityIndicator color={palette.primary} style={{ padding: 40 }} /> : items.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="file-text" size={30} color={palette.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: palette.foreground }]}>No billing records yet</Text>
            <Text style={[styles.emptyText, { color: palette.mutedForeground }]}>Generated invoices and payouts will appear here.</Text>
          </View>
        ) : items.map((item) => (
          <View key={item.id} style={[styles.row, { borderBottomColor: palette.border }]}>
            <View style={[styles.icon, { backgroundColor: palette.accent }]}><Feather name="file-text" size={17} color={palette.foreground} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: palette.foreground }]}>{item.patientName || item.invoiceNumber || "Consultation invoice"}</Text>
              <Text style={[styles.rowMeta, { color: palette.mutedForeground }]}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-IN") : "—"}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={[styles.amount, { color: palette.foreground }]}>₹{Number(item.totalAmount || item.amount || 0).toLocaleString("en-IN")}</Text>
              <Text style={[styles.status, { color: (item.status || "").toLowerCase() === "paid" ? palette.success : palette.warning }]}>{(item.status || "PENDING").toUpperCase()}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: keyof typeof Feather.glyphMap }) {
  const palette = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Feather name={icon} size={16} color={palette.mutedForeground} />
      <Text style={[styles.statValue, { color: palette.foreground }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.statLabel, { color: palette.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 18 },
  brandRow: { marginBottom: 22 },
  stats: { flexDirection: "row", gap: 8, marginTop: 22 },
  stat: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 11, minWidth: 0 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 9 },
  statLabel: { fontSize: 9, fontFamily: "Inter_500Medium", marginTop: 2 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 26, marginBottom: 10 },
  card: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  row: { padding: 14, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  rowMeta: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 3 },
  amount: { fontSize: 13, fontFamily: "Inter_700Bold" },
  status: { fontSize: 9, fontFamily: "Inter_700Bold" },
  empty: { alignItems: "center", paddingVertical: 52, paddingHorizontal: 20, gap: 8 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 12, textAlign: "center", fontFamily: "Inter_400Regular" },
});