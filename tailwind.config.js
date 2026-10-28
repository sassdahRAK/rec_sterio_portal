/**
 * Design tokens for the public dataset portal.
 *
 * Two layers, per the design-system model: `index.css` holds the primitive
 * palette and maps it onto semantic custom properties, and this file only
 * aliases Tailwind names onto those semantic properties. Components therefore
 * never see a raw hex value, and dark mode is a single override in index.css.
 *
 * The identity is deliberate, not the default: a crimson accent (not the
 * generic pink, and not the console's blue), and the audio waveform as the
 * artifact that carries the subject. Light is the primary theme (the design
 * reference is light); dark is a full mapping, not an afterthought.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--color-surface-2) / <alpha-value>)',
        raised: 'rgb(var(--color-raised) / <alpha-value>)',
        line: 'rgb(var(--color-border) / <alpha-value>)',
        'line-soft': 'rgb(var(--color-border-soft) / <alpha-value>)',
        fg: 'rgb(var(--color-text) / <alpha-value>)',
        dim: 'rgb(var(--color-text-muted) / <alpha-value>)',
        faint: 'rgb(var(--color-text-faint) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-strong': 'rgb(var(--color-accent-strong) / <alpha-value>)',
        'accent-soft': 'rgb(var(--color-accent-soft) / <alpha-value>)',
        ok: 'rgb(var(--color-ok) / <alpha-value>)',
        'ok-soft': 'rgb(var(--color-ok-soft) / <alpha-value>)',
        bad: 'rgb(var(--color-bad) / <alpha-value>)',
        'bad-soft': 'rgb(var(--color-bad-soft) / <alpha-value>)',
        warn: 'rgb(var(--color-warn) / <alpha-value>)',
        'warn-soft': 'rgb(var(--color-warn-soft) / <alpha-value>)',
      },
      fontFamily: {
        // Space Grotesk is the display face (brand consistency with the
        // console); Inter carries the interface. Both are already in the
        // workspace, so no new font download is introduced.
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Modular scale ~1.25, plus a couple of small utility steps.
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.875rem', { lineHeight: '1.375rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.625rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      borderRadius: {
        sm: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 8px 24px -16px rgb(16 24 40 / 0.18)',
        lift: '0 2px 4px 0 rgb(16 24 40 / 0.06), 0 16px 40px -16px rgb(16 24 40 / 0.28)',
      },
      maxWidth: {
        content: '72rem',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 180ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
