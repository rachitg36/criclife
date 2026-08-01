import { useUiStore } from '@/stores/uiStore';

/**
 * Tactile feedback for the scorer pad. Every commit should feel different
 * enough that a scorer knows what registered without looking.
 * docs/05-SCORER-VIEW.md § 4
 */
export type HapticKind = 'dot' | 'runs' | 'boundary' | 'wicket' | 'error' | 'select';

const PATTERNS: Record<HapticKind, number | number[]> = {
  select: 8,
  dot: 10,
  runs: 18,
  boundary: [14, 40, 14],
  wicket: [30, 50, 60],
  error: [40, 30, 40],
};

export function haptic(kind: HapticKind): void {
  if (!useUiStore.getState().hapticsEnabled) return;
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* unsupported or blocked — silent is correct here */
  }
}
