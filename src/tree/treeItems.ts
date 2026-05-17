import type * as vscode from 'vscode';
import { RequestRegion } from '../types';
import { PinnedEntry } from '../state/favoritesStore';

/** A filesystem folder that (transitively) contains request files. */
export interface FolderNode {
  kind: 'folder';
  label: string;
  children: NavNode[];
}

/** A single `.http` / `.rest` file. */
export interface FileNode {
  kind: 'file';
  label: string;
  uri: vscode.Uri;
  requestCount: number;
  expanded: boolean;
  children: NavNode[];
}

/** A `####`+ section header inside a file. */
export interface SectionNode {
  kind: 'section';
  label: string;
  children: NavNode[];
}

/** A single request within a file. */
export interface RequestNode {
  kind: 'request';
  uri: vscode.Uri;
  /** Line to jump to — kept top-level so command args read uniformly. */
  line: number;
  region: RequestRegion;
  /** True when this request's key is in the FavoritesStore. */
  pinned: boolean;
  /** The computed key for this request (used by pin/unpin commands). */
  key: string;
  /** Distinguishes pinned aliases from the same request in the file tree. */
  source: 'tree' | 'pinned';
}

/** The top-level "Pinned" group that appears above the file tree. */
export interface GroupNode {
  kind: 'group';
  id: 'pinned';
  children: NavNode[];
}

/**
 * A pinned entry whose underlying request can no longer be resolved in the
 * index (file deleted, request renamed, etc.).
 */
export interface StalePinNode {
  kind: 'stalePin';
  entry: PinnedEntry;
}

export type NavNode = FolderNode | FileNode | SectionNode | RequestNode | GroupNode | StalePinNode;
