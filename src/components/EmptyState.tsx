import type { ReactNode } from 'react';

export default function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="font-display text-lg font-semibold text-fg">{title}</p>
      {children ? <div className="max-w-md text-sm text-dim">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}