import { useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { colors } from "@examgpt/ui-tokens";
import { trpc } from "../src/trpc";

export default function HomeScreen() {
  const scheme = useColorScheme();
  const dark = scheme === "dark";
  const health = useQuery(trpc.health.ping.queryOptions());

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: dark ? colors.slate[950] : "#ffffff" },
      ]}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: dark ? colors.slate[900] : "#ffffff",
            borderColor: dark ? colors.slate[800] : colors.slate[200],
          },
        ]}
      >
        <Text style={[styles.eyebrow, { color: colors.primary[600] }]}>
          ExamGPT · Phase 0
        </Text>
        <Text
          style={[
            styles.title,
            { color: dark ? colors.slate[50] : colors.slate[900] },
          ]}
        >
          Monorepo foundation
        </Text>
        <Text style={[styles.subtitle, { color: colors.slate[500] }]}>
          Mobile client calling health.ping on the Express + tRPC server.
        </Text>

        <View
          style={[
            styles.panel,
            {
              backgroundColor: dark ? colors.slate[800] : colors.slate[50],
              borderColor: dark ? colors.slate[700] : colors.slate[200],
            },
          ]}
        >
          {health.isLoading ? (
            <ActivityIndicator color={colors.primary[600]} />
          ) : health.isError ? (
            <View>
              <Text style={[styles.errorTitle, { color: colors.error }]}>
                API unreachable
              </Text>
              <Text style={[styles.meta, { color: colors.slate[500] }]}>
                {health.error.message}
              </Text>
            </View>
          ) : (
            <View>
              <Text style={[styles.okTitle, { color: colors.success }]}>
                health.ping · ok
              </Text>
              <Text
                style={[
                  styles.mono,
                  { color: dark ? colors.slate[100] : colors.slate[800] },
                ]}
              >
                {health.data?.service}
              </Text>
              <Text style={[styles.meta, { color: colors.slate[500] }]}>
                {health.data?.timestamp}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: "600",
  },
  title: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: "600",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  panel: {
    marginTop: 24,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  errorTitle: {
    fontWeight: "600",
  },
  okTitle: {
    fontWeight: "600",
  },
  mono: {
    marginTop: 8,
    fontFamily: "monospace",
    fontSize: 14,
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: "monospace",
  },
});
