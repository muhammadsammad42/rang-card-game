/**
 * ErrorBoundary.tsx — catches render errors below it so one bug never shows a
 * red screen. The global boundary (in _layout.tsx) shows a friendly
 * "Something went wrong — Restart" screen; smaller boundaries (e.g. around a
 * Lottie animation) can pass `fallback={null}` to fail silently.
 */
import { Component, ErrorInfo, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/theme';

import { AppButton } from './AppButton';

interface Props {
  children: ReactNode;
  /** What to render instead of the crashed subtree. Undefined = default screen. */
  fallback?: ReactNode;
  /** Called when the user taps Restart on the default screen. */
  onReset?: () => void;
  onError?: (error: Error) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error);
    if (__DEV__) console.warn('ErrorBoundary caught:', error.message, info.componentStack?.slice(0, 300));
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <View style={styles.screen}>
        <Text style={styles.suits}>♠ ♥ ♣ ♦</Text>
        <Text style={[typography.title, styles.title]}>Something went wrong</Text>
        <Text style={[typography.body, styles.body]}>
          The table was knocked over. Your settings and history are safe — tap Restart to deal again.
        </Text>
        <AppButton label="Restart" icon="refresh" onPress={this.reset} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.night,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  suits: { color: colors.gold, fontSize: 28, letterSpacing: 8 },
  title: { color: colors.ivory, textAlign: 'center' },
  body: { color: colors.textMuted, textAlign: 'center', maxWidth: 340 },
});
