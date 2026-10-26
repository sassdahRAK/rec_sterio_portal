import { useEffect, useState } from 'react';
import { listFolders } from '../api/client';
import type { FolderSummary, Role } from '../api/types';
import { useSession } from '../store/auth';

/**
 * The caller's role on every folder they can see.
 *
 * The dataset card list does not repeat a role per card, so the portal fetches
 * the folder tree once and maps `my_role` down it. Without this a member
 * invited as a *viewer* would be shown edit and delete controls that the API
 * would reject — and a guest arriving through an editor share link would not
 * be shown the controls they are entitled to.
 */
export function useFolderRoles(): Record<string, Role | null> {
  const session = useSession();
  const [roles, setRoles] = useState<Record<string, Role | null>>({});

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setRoles({});
      return;
    }
    listFolders()
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, Role | null> = {};
        const walk = (nodes: FolderSummary[]) => {
          for (const node of nodes) {
            map[node.id] = node.my_role ?? null;
            walk(node.children);
          }
        };
        walk(res.items);
        setRoles(map);
      })
      .catch(() => {
        // A failed role lookup must not break browsing: every gate stays closed.
        if (!cancelled) setRoles({});
      });
    return () => {
      cancelled = true;
    };
  }, [session?.token]);

  return roles;
}
