import type * as vscode from 'vscode';
import { RequestRegion } from '../types';

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
}

export type NavNode = FolderNode | FileNode | SectionNode | RequestNode;
