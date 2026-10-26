import { useMemo } from 'react';

/** Deterministic PRNG so a given video always renders the same waveform. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The audio artifact. A static bar waveform stands in for the extracted 16 kHz
 * WAV: it is the subject's own material, so it carries the identity better than
 * a generic icon would.
 */
export default function Waveform({
  seed,
  bars = 48,
  progress = 0,
  className = '',
}: {
  seed: string;
  bars?: number;
  /** 0–1, tints the played portion. */
  progress?: number;
  className?: string;
}) {
  const heights = useMemo(() => {
    const rand = mulberry32(hashSeed(seed || 'recsterio'));
    // Envelope: quieter at both ends, like a real utterance.
    return Array.from({ length: bars }, (_, i) => {
      const envelope = 0.35 + 0.65 * Math.sin((Math.PI * i) / (bars - 1));
      return Math.max(0.12, Math.min(1, rand() * envelope + 0.08));
    });
  }, [seed, bars]);

  const played = Math.round(Math.max(0, Math.min(1, progress)) * bars);

  return (
    <div
      className={`flex items-center gap-[2px] ${className}`}
      role="img"
      aria-label="Audio waveform"
    >
      {heights.map((h, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full transition-colors ${i < played ? 'bg-accent' : 'bg-line'}`}
          style={{ height: `${Math.round(h * 28)}px` }}
        />
      ))}
    </div>
  );
}