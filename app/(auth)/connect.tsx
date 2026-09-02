/**
 * Connect — the tenant code step. Reframed from a bureaucratic gate into
 * a warm setup task: a clear heading, reassuring helper copy, and
 * operator-neutral language (school OR office).
 *
 * Also offers live search-as-you-type: as the user types a restaurant
 * name, slug, or pasted link, matching restaurants appear below the
 * field. Tapping one runs the exact same connect flow as typing the
 * code manually and hitting Continue — search is purely additive, the
 * manual entry path is unchanged and always works even if search fails
 * or returns nothing.
 */

import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  validateSchoolCode,
  setSchoolCode,
  setStoredBaseUrl,
  getJWT,
  searchRestaurants,
} from "../../lib/api";
import { useRefreshTheme } from "../../lib/theme-context";
import { useTheme } from "../../lib/theme";
import { BrandMark } from "../../components/BrandMark";
import { PrimaryButton } from "../../components/ui";
import type { RestaurantSearchResult } from "../../lib/types";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export default function ConnectScreen() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<RestaurantSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const router = useRouter();
  const refreshTheme = useRefreshTheme();
  const theme = useTheme();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a slow, stale search response overwriting results from
  // a newer query that resolved first (classic race on fast typing).
  const searchSeq = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = code.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const seq = ++searchSeq.current;
    debounceRef.current = setTimeout(async () => {
      const found = await searchRestaurants(query);
      if (seq === searchSeq.current) {
        setResults(found);
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code]);

  /**
   * Shared by both the manual "Continue" button and tapping a search
   * result — resolves the given code/slug, persists it, refreshes the
   * tenant theme, and navigates on.
   */
  async function connectTo(input: string) {
    const trimmed = input.toLowerCase().trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    setResults([]);
    try {
      const { valid, baseUrl } = await validateSchoolCode(trimmed);
      if (!valid) {
        setError(
          "We couldn't find that. Try the full web address your school or office gave you — e.g. lunch.yourdomain.com.",
        );
        return;
      }
      await setSchoolCode(trimmed);
      if (baseUrl) await setStoredBaseUrl(baseUrl);
      await refreshTheme();

      const jwt = await getJWT();
      if (jwt) router.replace("/(app)");
      else router.replace("/(auth)/sign-in");
    } catch {
      setError("Couldn't connect. Check your internet and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleContinue() {
    connectTo(code);
  }

  function handleSelectResult(result: RestaurantSearchResult) {
    setCode(result.slug);
    connectTo(result.slug);
  }

  const showResults = results.length > 0 && !loading;

  return (
    <View style={[styles.fill, { backgroundColor: theme.dark }]}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <SafeAreaView style={styles.fill}>
          <View style={styles.content}>
            <BrandMark size={48} radius={13} />
            <Text style={[styles.title, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
              Connect to your{"\n"}lunch program
            </Text>
            <Text style={[styles.sub, { color: theme.textSecondary }]}>
              Your school or office sent you a code or a web link. Enter it once — we&apos;ll remember it.
            </Text>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.textMuted }]}>CODE OR LINK</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.surface,
                    borderColor: error ? theme.danger : theme.border,
                    color: theme.textPrimary,
                  },
                ]}
                value={code}
                onChangeText={(t) => {
                  setCode(t);
                  setError("");
                }}
                placeholder="e.g. lunch.yourschool.com"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={handleContinue}
              />
              {error ? (
                <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
              ) : (
                <View style={styles.hintRow}>
                  <Ionicons name="lock-closed-outline" size={13} color={theme.textMuted} />
                  <Text style={[styles.hint, { color: theme.textMuted }]}>
                    Used only to load the right menu — nothing is shared.
                  </Text>
                </View>
              )}

              {searching && (
                <View style={styles.searchingRow}>
                  <ActivityIndicator size="small" color={theme.textMuted} />
                  <Text style={[styles.hint, { color: theme.textMuted }]}>Searching…</Text>
                </View>
              )}

              {showResults && (
                <View style={[styles.resultsBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  {results.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={styles.resultRow}
                      onPress={() => handleSelectResult(r)}
                      accessibilityRole="button"
                      accessibilityLabel={`Connect to ${r.name}`}
                    >
                      {r.logoUrl ? (
                        <Image source={{ uri: r.logoUrl }} style={styles.resultLogo} />
                      ) : (
                        <View
                          style={[
                            styles.resultLogo,
                            styles.resultLogoFallback,
                            { backgroundColor: r.primaryColor || theme.accent },
                          ]}
                        >
                          <Text style={styles.resultLogoInitial}>
                            {r.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.resultTextCol}>
                        <Text style={[styles.resultName, { color: theme.textPrimary }]} numberOfLines={1}>
                          {r.name}
                        </Text>
                        <Text style={[styles.resultSlug, { color: theme.textMuted }]} numberOfLines={1}>
                          {r.slug}.lunchpad.us
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={{ flex: 1 }} />

            <PrimaryButton
              label="Continue"
              icon="arrow-forward"
              onPress={handleContinue}
              loading={loading}
              disabled={!code.trim()}
            />
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingVertical: 16, gap: 14, justifyContent: "center" },
  title: { fontSize: 27, fontWeight: "600", letterSpacing: -0.5, lineHeight: 32, marginTop: 8 },
  sub: { fontSize: 15, lineHeight: 22 },
  field: { gap: 8, marginTop: 8 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 1.3 },
  input: { borderRadius: 14, borderWidth: 1.6, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16 },
  error: { fontSize: 13, lineHeight: 18 },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  hint: { fontSize: 12.5, flex: 1 },
  searchingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  resultsBox: { borderRadius: 14, borderWidth: 1.2, overflow: "hidden", marginTop: 2 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  resultLogo: { width: 36, height: 36, borderRadius: 10 },
  resultLogoFallback: { alignItems: "center", justifyContent: "center" },
  resultLogoInitial: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  resultTextCol: { flex: 1, gap: 2 },
  resultName: { fontSize: 15, fontWeight: "600" },
  resultSlug: { fontSize: 12.5 },
});
