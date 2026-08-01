import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  applyAccent,
  applyCalm,
  applyTheme,
  type AccentName,
  type ThemeMode,
} from '@/lib/theme';

/** User preferences. Mirrors `profiles` columns; synced to the server on login. */
type UiState = {
  theme: ThemeMode;
  accent: AccentName;
  calmMode: boolean;
  /** Mirrors the scorer pad for left-handed users. docs/05 § 4. */
  scorerHand: 'left' | 'right';
  hapticsEnabled: boolean;
  soundEnabled: boolean;
  /** Optional shot/pitch capture after each ball. docs/05 § 8. */
  advancedScoring: boolean;
  keepScreenAwake: boolean;

  setTheme: (t: ThemeMode) => void;
  setAccent: (a: AccentName) => void;
  setCalmMode: (c: boolean) => void;
  setScorerHand: (h: 'left' | 'right') => void;
  toggleHaptics: () => void;
  toggleSound: () => void;
  setAdvancedScoring: (v: boolean) => void;
  setKeepScreenAwake: (v: boolean) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      accent: 'cyan',
      calmMode: false,
      scorerHand: 'right',
      hapticsEnabled: true,
      soundEnabled: false,
      advancedScoring: false,
      keepScreenAwake: true,

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      setAccent: (accent) => {
        applyAccent(accent);
        set({ accent });
      },
      setCalmMode: (calmMode) => {
        applyCalm(calmMode);
        set({ calmMode });
      },
      setScorerHand: (scorerHand) => set({ scorerHand }),
      toggleHaptics: () => set((s) => ({ hapticsEnabled: !s.hapticsEnabled })),
      toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
      setAdvancedScoring: (advancedScoring) => set({ advancedScoring }),
      setKeepScreenAwake: (keepScreenAwake) => set({ keepScreenAwake }),
    }),
    {
      name: 'criclife.ui',
      // Keep these keys aligned with the blocking script in index.html.
      partialize: (s) => ({
        theme: s.theme,
        accent: s.accent,
        calmMode: s.calmMode,
        scorerHand: s.scorerHand,
        hapticsEnabled: s.hapticsEnabled,
        soundEnabled: s.soundEnabled,
        advancedScoring: s.advancedScoring,
        keepScreenAwake: s.keepScreenAwake,
      }),
    }
  )
);
