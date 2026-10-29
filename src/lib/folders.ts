import type { PublicFolder } from '../api/types';

/** One row of the folder picker: the folder plus its depth and full path. */
export interface FolderOption {
  id: string;
  name: string;
  depth: number;
  /** Names from the root down to this folder, inclusive. */
  path: string[];
}

/** Folder tree flattened into picker options; depth shows as indentation. */
export function flattenFolders(
  nodes: PublicFolder[],
  depth = 0,
  parents: string[] = [],
): FolderOption[] {
  return nodes.flatMap((n) => {
    const path = [...parents, n.name];
    return [
      { id: n.id, name: n.name, depth, path },
      ...flattenFolders(n.children, depth + 1, path),
    ];
  });
}

/** Picker label: the parent chain joined with " · " (roots show just their name). */
export const folderOptionLabel = (f: FolderOption): string => f.path.join(' · ');
