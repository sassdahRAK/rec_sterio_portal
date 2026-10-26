import type { Badge as BadgeKind } from '../api/types';

/**
 * The provenance badge. It answers the question every dataset visitor has:
 * "was this transcript corrected by a human, or is it still raw ASR output?"
 * Raw is crimson (the accent), Cleaned is green — the two states are never
 * confused for one another.
 */
export default function Badge({ kind, className = '' }: { kind: BadgeKind; className?: string }) {
  const styles =
    kind === 'cleaned'
      ? 'bg-ok-soft text-ok border-ok/25'
      : 'bg-bad-soft text-bad border-bad/25';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.08em] ${styles} ${className}`}
    >
      {kind}
    </span>
  );
}