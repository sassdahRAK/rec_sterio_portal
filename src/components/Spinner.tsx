export default function Spinner({ label = 'Loading…', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm text-dim ${className}`} role="status" aria-live="polite">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent"
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}