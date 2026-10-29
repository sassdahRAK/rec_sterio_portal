import { useEffect, useState, type FormEvent } from 'react';

interface SearchBarProps {
  /** When provided, the box mirrors it (e.g. the page's ?q= param). */
  value?: string;
  onSubmit: (q: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
}

/**
 * The one search box, relocated from the header into the pages that own the
 * list it filters. Submitting reports the trimmed query; typing stays local
 * until then.
 */
export default function SearchBar({
  value,
  onSubmit,
  placeholder = 'Search…',
  id = 'search',
  className,
}: SearchBarProps) {
  const [text, setText] = useState(value ?? '');

  // Sync when the page sets ?q= itself (back/forward, deep links).
  useEffect(() => {
    if (value !== undefined) setText(value);
  }, [value]);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit(text.trim());
  }

  return (
    <form role="search" onSubmit={submit} className={`relative ${className ?? ''}`}>
      <label htmlFor={id} className="sr-only">
        Search the dataset
      </label>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        id={id}
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-full border border-line bg-surface-2 py-2 pl-9 pr-4 text-sm text-fg placeholder:text-faint outline-none transition focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/25"
      />
    </form>
  );
}
