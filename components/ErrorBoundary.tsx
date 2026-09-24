/**
 * Top-level React error boundary. Renders a minimal fallback UI when
 * a descendant throws during render/commit, and reports the error to
 * Sentry via `reportError`.
 *
 * Deliberately tiny — no third-party lib, no theme dependency, no font
 * loading. This has to render even if the whole app failed to mount, so
 * it uses raw RN primitives and inline styles only.
 *
 * NOTE: React error boundaries do NOT catch:
 *   - Errors inside event handlers (add try/catch there)
 *   - Errors in async code / Promises (report via `reportError` directly)
 *   - Server-side rendering errors (N/A here)
 *   - Errors thrown in the boundary itself
 * See `lib/api.ts` for the network-side reporting.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { reportError } from "../lib/sentry";

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // `errorInfo.componentStack` is a plain string with no PII — safe to
    // forward. We do NOT pass any user/network context here.
    reportError(error, { componentStack: errorInfo.componentStack });
  }

  private handleReset = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            We&apos;ve been notified. Please try again.
          </Text>
          <Pressable
            onPress={this.handleReset}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F6F1E6",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1F1B16",
    marginBottom: 8,
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    color: "#4A4137",
    marginBottom: 24,
    textAlign: "center",
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#1F1B16",
    borderRadius: 8,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#F6F1E6",
    fontSize: 16,
    fontWeight: "500",
  },
});
