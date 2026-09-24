import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookingCard } from "@/components/BookingCard";
import { BrandMark } from "@/components/BrandMark";
import { ScreenHeading } from "@/components/ScreenHeading";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { Booking } from "@/lib/mobile-models";

const STATUS_FILTERS = ["All", "Scheduled", "Ongoing", "Completed", "Missed", "Cancelled", "Rejected", "Expired"];

export default function ConsultationsScreen() {
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const query = useQuery<Booking[]>({
    queryKey: ["consultations", user?.role],
    queryFn: async () => {
      const response = await apiFetch(user?.role === "provider" ? "/api/provider/bookings" : "/api/bookings");
      if (!response.ok) throw new Error("Unable to load consultations");
      return response.json();
    },
    enabled: !!user?.role,
  });
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data || []).filter((item) => {
      const searchable = `${item.patientName || ""} ${item.providerName || ""} ${item.bookingNumber || ""}`.toLowerCase();
      const statusMatch = filter === "All" || item.status.replace("_", " ").toLowerCase().includes(filter.toLowerCase());
      return statusMatch && (term.length < 3 || searchable.includes(term));
    });
  }, [filter, query.data, search]);

  return (
    <View style={[styles.screen, { backgroundColor: palette.background, paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <BrandMark compact />
        <ScreenHeading title="Consultations" subtitle="Search and review the complete clinical history" />
        <View style={[styles.search, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Feather name="search" size={17} color={palette.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search patient, consultant or ID"
            placeholderTextColor={palette.mutedForeground}
            style={[styles.searchInput, { color: palette.foreground }]}
          />
          {!!search && <Pressable onPress={() => setSearch("")}><Feather name="x" size={17} color={palette.mutedForeground} /></Pressable>}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {STATUS_FILTERS.map((item) => (
          <Pressable
            key={item}
            onPress={() => setFilter(item)}
            style={[styles.filter, { backgroundColor: filter === item ? palette.foreground : palette.card, borderColor: filter === item ? palette.foreground : palette.border }]}
          >
            <Text style={[styles.filterText, { color: filter === item ? palette.card : palette.foreground }]}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 125 : insets.bottom + 100 }]}>
        {query.isLoading ? (
          <ActivityIndicator color={palette.primary} style={{ marginTop: 50 }} />
        ) : visible.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="search" size={32} color={palette.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: palette.foreground }]}>No consultations found</Text>
            <Text style={[styles.emptyText, { color: palette.mutedForeground }]}>Try a different search or status filter.</Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            {visible.map((item) => <BookingCard key={item.id} booking={item} />)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 18, paddingTop: 18 },
  search: { height: 46, marginTop: 18, borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 13, gap: 9 },
  searchInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  filters: { paddingHorizontal: 18, paddingVertical: 12, gap: 7 },
  filter: { height: 32, paddingHorizontal: 13, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  filterText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 18 },
  card: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, overflow: "hidden" },
  empty: { alignItems: "center", paddingTop: 70, gap: 9 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 12, fontFamily: "Inter_400Regular" },
});