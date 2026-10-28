/**
 * Light is the default (the design reference is light); dark is an explicit
 * user choice that persists. `prefers-color-scheme` is honoured only when the
 * visitor has never chosen.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      setTheme: (theme) => {
        apply(theme);
        set({ theme });
      },
      toggle: () => {
        const next = get().theme === 'light' ? 'dark' : 'light';
        apply(next);
        set({ theme: next });
      },
    }),
    {
      name: 'recsterio.portal.theme',
      onRehydrateStorage: () => (state) => {
        // Apply the stored choice (or the OS preference) before first paint.
        const theme = state?.theme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        apply(theme);
      },
    },
  ),
);
