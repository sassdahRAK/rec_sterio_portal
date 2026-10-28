/**
 * Portal session.
 *
 * One token store covers all three ways in: an operator signs in (admin/member),
 * a visitor redeems a passcode or share link (guest, scoped to exactly one
 * folder), and everyone else is anonymous — which the API already treats as a
 * guest, so no token is needed to browse public datasets.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setTokenProvider } from '../api/client';
import type { Role } from '../api/types';

export type SessionRole = 'admin' | 'member' | 'guest';

export interface Session {
  token: string;
  role: SessionRole;
  email: string | null;
  name: string | null;
  /** Folders a scoped guest token may read. Empty for a full session. */
  folderIds: string[];
  /** The permission a passcode or share link granted — never inferred. */
  folderRole: Role | null;
  /** Why the guest token exists — drives the "unlock another folder" hint. */
  access: 'passcode' | 'share' | null;
  expiresAt: string | null;
}

const ROLE_RANK: Record<string, number> = { viewer: 1, commenter: 2, editor: 3 };

/** True when `role` is at least `need` in the viewer < commenter < editor scale. */
export function roleAtLeast(role: string | null | undefined, need: Role): boolean {
  return (ROLE_RANK[role ?? ''] ?? 0) >= ROLE_RANK[need];
}

interface AuthState {
  session: Session | null;
  setSession: (session: Session) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      clear: () => set({ session: null }),
    }),
    { name: 'recsterio.portal.session' },
  ),
);

// The API client reads the token through this provider rather than importing
// the store, which keeps the dependency one-directional.
setTokenProvider(() => useAuthStore.getState().session?.token ?? null);

export function useSession(): Session | null {
  return useAuthStore((s) => s.session);
}

export function useIsSignedIn(): boolean {
  const session = useSession();
  return session?.role === 'admin' || session?.role === 'member';
}

/**
 * Whether the session may edit `folderId`. Pure on purpose: it is called inside
 * `.map()` over cards and after early returns, where a hook would change the
 * hook order between renders and take the whole page down.
 *
 * `folderRoles` comes from `useFolderRoles()` and holds the API's own answer
 * per folder. When it has an entry, that wins over the account-level role: a
 * member invited as a *viewer* must not see controls the API would 403, and a
 * guest holding an editor share link must see the ones they are entitled to.
 * A missing entry (the folder is not in the fetched tree) falls back to the
 * coarse rule so the caller still gets an answer.
 */
export function canEditFolder(
  session: Session | null,
  folderId: string,
  folderRoles?: Record<string, Role | null>,
): boolean {
  if (!session) return false;
  const role = folderRoles?.[folderId];
  if (role !== undefined) return roleAtLeast(role, 'editor');
  if (session.role === 'admin' || session.role === 'member') return true;
  return (
    session.role === 'guest' &&
    session.folderIds.includes(folderId) &&
    roleAtLeast(session.folderRole, 'editor')
  );
}

export function signOut(): void {
  useAuthStore.getState().clear();
}

/**
 * A stable per-browser key. Passcode device limits are enforced against this,
 * so it must survive reloads but stay private to this browser.
 */
export function deviceKey(): string {
  const KEY = 'recsterio.portal.device';
  let key = localStorage.getItem(KEY);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(KEY, key);
  }
  return key;
}
