/**
 * LottieAnim.tsx — a crash-proof wrapper around lottie-react-native.
 *
 * Animations are referenced by name from src/theme/animations.ts. If an
 * animation fails to load or render, the component quietly renders the
 * `fallback` (default: nothing) instead of crashing the app.
 */
import LottieView from 'lottie-react-native';
import { ReactNode, useState } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

import { AnimationName, animations } from '@/theme/animations';

import { ErrorBoundary } from './ErrorBoundary';

interface Props {
  name: AnimationName;
  style?: StyleProp<ViewStyle>;
  loop?: boolean;
  autoPlay?: boolean;
  speed?: number;
  onFinish?: () => void;
  fallback?: ReactNode;
}

export function LottieAnim({ name, style, loop = true, autoPlay = true, speed = 1, onFinish, fallback = null }: Props) {
  const [failed, setFailed] = useState(false);
  const source = animations[name];
  if (failed || !source) return <>{fallback}</>;
  return (
    <ErrorBoundary fallback={fallback} onError={() => setFailed(true)}>
      <LottieView
        source={source}
        autoPlay={autoPlay}
        loop={loop}
        speed={speed}
        resizeMode="contain"
        style={style}
        onAnimationFinish={(cancelled) => !cancelled && onFinish?.()}
        onAnimationFailure={() => setFailed(true)}
      />
    </ErrorBoundary>
  );
}
