/** Shared class strings so every control in the portal looks the same. */

export const inputCls =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg ' +
  'placeholder:text-faint outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25 ' +
  'disabled:opacity-50';

export const btnBase =
  'tap-pad inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium ' +
  'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/50 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/** The primary action in the portal is crimson — the brand colour. */
export const btnPrimary = `${btnBase} border-accent bg-accent text-white hover:bg-accent-strong`;

export const btnNeutral = `${btnBase} border-line bg-surface text-dim hover:bg-surface-2 hover:text-fg`;

export const btnGhost = `${btnBase} border-transparent bg-transparent text-dim hover:bg-surface-2 hover:text-fg`;

export const btnDanger = `${btnBase} border-bad/40 bg-bad-soft text-bad hover:bg-bad/15`;

export const labelCls =
  'mb-1.5 block text-2xs font-semibold uppercase tracking-[0.14em] text-faint';

export const iconBtn =
  'tap-pad inline-flex h-8 w-8 items-center justify-center rounded-md text-dim transition-colors ' +
  'hover:bg-surface-2 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/50';
