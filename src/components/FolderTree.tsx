import { Link } from 'react-router-dom';
import type { PublicFolder } from '../api/types';

/**
 * The dataset's folder hierarchy. Each node is a link, so the tree is a
 * navigation device, not decoration: it encodes how the dataset is organised.
 */
export default function FolderTree({ nodes }: { nodes: PublicFolder[] }) {
  if (nodes.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1">
      {nodes.map((node) => (
        <li key={node.id}>
          <Link
            to={`/folder/${node.id}`}
            className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-dim transition-colors hover:bg-surface-2 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong/50"
          >
            <FolderIcon className="shrink-0 text-faint transition-colors group-hover:text-accent" />
            <span className="truncate">{node.name}</span>
            <span className="ml-auto font-mono text-xs text-faint">{node.cards.length}</span>
          </Link>
          {node.children.length > 0 ? (
            <div className="ml-4 border-l border-line pl-2">
              <FolderTree nodes={node.children} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function FolderIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}