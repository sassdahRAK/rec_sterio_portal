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

/**
 * Icon buttons: `p-2` around a 16px icon is the honest visual size (~32px box)
 * on fine pointers; `tap-pad` lifts the hit area to 44px min on touch without
 * a fixed h-/w- pair silently fighting it.
 */
export const iconBtn =
  'tap-pad inline-flex items-center justify-center rounded-md p-2 text-dim transition-colors ' +
  'hover:bg-surface-2 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/50';

/**
 * Select with a hidden native arrow and a drawn chevron, matching inputCls's
 * border/radius/focus idiom (same structure as the admin console's selectCls,
 * with the portal's own tokens).
 */
export const selectCls =
  'tap-pad w-full appearance-none rounded-md border border-line bg-surface-2 px-3 py-2 pr-8 text-sm text-fg ' +
  "bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] " +
  'bg-[length:12px_12px] bg-[position:right_0.6rem_center] bg-no-repeat ' +
  'outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-50';
