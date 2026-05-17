import * as vscode from 'vscode';
import { WorkspaceIndex } from '../workspace/workspaceIndex';
import { ParsedFile, displayLabel } from '../types';
import { methodBadgeIcon } from '../icons/methodIcon';
import {
  FileNode,
  FolderNode,
  GroupNode,
  NavNode,
  RequestNode,
  SectionNode,
  StalePinNode
} from './treeItems';
import { FavoritesStore } from '../state/favoritesStore';
import { computeKey } from '../state/requestKey';

interface DirEntry {
  dirs: Map<string, DirEntry>;
  files: ParsedFile[];
}

/** Per-build cache of display file names, keyed by ParsedFile identity. */
const fileNames = new WeakMap<ParsedFile, string>();

// --- Shared tree item builders -------------------------------------------

function groupItem(node: GroupNode): vscode.TreeItem {
  const item = new vscode.TreeItem('Pinned', vscode.TreeItemCollapsibleState.Collapsed);
  item.id = `group:${node.id}`;
  item.iconPath = new vscode.ThemeIcon('pinned');
  item.contextValue = 'group-pinned';
  return item;
}

function folderItem(node: FolderNode): vscode.TreeItem {
  const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
  item.id = `folder:${node.id}`;
  item.iconPath = vscode.ThemeIcon.Folder;
  item.contextValue = 'folder';
  return item;
}

function fileItem(node: FileNode, expanded: boolean): vscode.TreeItem {
  const state = expanded
    ? vscode.TreeItemCollapsibleState.Expanded
    : vscode.TreeItemCollapsibleState.Collapsed;
  const item = new vscode.TreeItem(node.label, state);
  item.id = `file:${node.uri.toString()}`;
  item.resourceUri = node.uri;
  item.iconPath = vscode.ThemeIcon.File;
  item.description = `${node.requestCount} request${node.requestCount === 1 ? '' : 's'}`;
  item.contextValue = 'file';
  item.tooltip = node.uri.fsPath;
  return item;
}

function sectionItem(node: SectionNode, expanded: boolean): vscode.TreeItem {
  const state = expanded
    ? vscode.TreeItemCollapsibleState.Expanded
    : vscode.TreeItemCollapsibleState.Collapsed;
  const item = new vscode.TreeItem(node.label, state);
  item.id = `section:${node.id}`;
  item.iconPath = new vscode.ThemeIcon('symbol-namespace');
  item.contextValue = 'section';
  return item;
}

function requestItem(node: RequestNode, extensionUri: vscode.Uri): vscode.TreeItem {
  const { region } = node;
  const item = new vscode.TreeItem(displayLabel(region), vscode.TreeItemCollapsibleState.None);
  item.id = `request:${node.source}:${node.key}`;
  item.iconPath = methodBadgeIcon(region.method, region.disabled, extensionUri);
  item.contextValue = node.pinned ? 'request-pinned' : 'request';

  const descParts: string[] = [];
  if (node.pinned) { descParts.push('$(pinned)'); }
  if (region.disabled) { descParts.push('(disabled)'); }
  item.description = descParts.join(' ') || undefined;

  const tooltipLines: string[] = [];
  if (region.method || region.url) {
    tooltipLines.push(`${region.method ?? ''} ${region.url ?? ''}`.trim());
  }
  if (region.refs.length > 0) {
    tooltipLines.push(`refs: ${region.refs.join(', ')}`);
  }
  item.tooltip = tooltipLines.join('\n') || undefined;

  item.command = {
    command: 'httpyac-primenav.reveal',
    title: 'Reveal Request',
    arguments: [{ uri: node.uri, line: node.line }]
  };
  return item;
}

function stalePinItem(node: StalePinNode): vscode.TreeItem {
  const { entry } = node;
  const item = new vscode.TreeItem(entry.label, vscode.TreeItemCollapsibleState.None);
  item.id = `stalePin:${entry.key}`;
  item.description = '(missing)';
  item.tooltip = `${entry.method ?? ''} ${entry.url ?? ''}`.trim() || entry.uri;
  item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
  item.contextValue = 'stale-pin';
  return item;
}

function buildNavTreeItem(
  node: NavNode,
  extensionUri: vscode.Uri,
  expandNodes: boolean
): vscode.TreeItem {
  switch (node.kind) {
    case 'group':    return groupItem(node);
    case 'folder':   return folderItem(node);
    case 'file':     return fileItem(node, expandNodes);
    case 'section':  return sectionItem(node, expandNodes);
    case 'request':  return requestItem(node, extensionUri);
    case 'stalePin': return stalePinItem(node);
  }
}

// --- Workspace tree provider (full tree, collapsed by default) -----------

export class RequestsTreeProvider implements vscode.TreeDataProvider<NavNode> {
  private readonly changeEmitter = new vscode.EventEmitter<NavNode | undefined | void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private roots: NavNode[] = [];

  constructor(
    private readonly index: WorkspaceIndex,
    private readonly store: FavoritesStore,
    private readonly extensionUri: vscode.Uri = vscode.Uri.file('')
  ) {
    this.roots = this.build();
    index.onDidChange(() => this.refresh());
    store.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.roots = this.build();
    this.changeEmitter.fire();
  }

  getChildren(element?: NavNode): NavNode[] {
    if (!element) { return this.roots; }
    switch (element.kind) {
      case 'request':
      case 'stalePin':
        return [];
      default:
        return element.children;
    }
  }

  getTreeItem(node: NavNode): vscode.TreeItem {
    return buildNavTreeItem(node, this.extensionUri, false);
  }

  findFileNode(uri: vscode.Uri): FileNode | undefined {
    const target = uri.toString();
    const visit = (nodes: NavNode[]): FileNode | undefined => {
      for (const node of nodes) {
        if (node.kind === 'file' && node.uri.toString() === target) { return node; }
        if (node.kind !== 'request' && node.kind !== 'stalePin') {
          const found = visit(node.children);
          if (found) { return found; }
        }
      }
      return undefined;
    };
    return visit(this.roots);
  }

  private build(): NavNode[] {
    const files = this.index.getAll();
    const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    const groupBySections = vscode.workspace
      .getConfiguration('httpyacPrimeNav')
      .get<boolean>('groupBySections', true);
    const showPinned = vscode.workspace
      .getConfiguration('httpyacPrimeNav')
      .get<boolean>('showPinned', true);

    const root: DirEntry = { dirs: new Map(), files: [] };
    for (const file of files) {
      const rel = vscode.workspace.asRelativePath(file.uri, multiRoot);
      const parts = rel.split(/[\\/]+/).filter(Boolean);
      const fileName = parts.pop() ?? rel;
      let cur = root;
      for (const segment of parts) {
        let next = cur.dirs.get(segment);
        if (!next) {
          next = { dirs: new Map(), files: [] };
          cur.dirs.set(segment, next);
        }
        cur = next;
      }
      cur.files.push(file);
      fileNames.set(file, fileName);
    }

    const fileTree = this.dirChildren(root, groupBySections);

    if (!showPinned) { return fileTree; }

    const pinned = this.store.pinned();
    if (pinned.length === 0) { return fileTree; }

    const keyToRequest = new Map<string, RequestNode>();
    for (const file of files) {
      for (const region of file.regions) {
        if (region.kind === 'request') {
          const key = computeKey(region, file.uri);
          keyToRequest.set(key, {
            kind: 'request',
            uri: file.uri,
            line: region.requestLine,
            region,
            pinned: true,
            key,
            source: 'pinned'
          });
        }
      }
    }

    const pinnedChildren: NavNode[] = pinned.map((entry) => {
      const node = keyToRequest.get(entry.key);
      return node ?? ({ kind: 'stalePin', entry } satisfies StalePinNode);
    });

    const group: GroupNode = { kind: 'group', id: 'pinned', children: pinnedChildren };
    return [group, ...fileTree];
  }

  private dirChildren(
    dir: DirEntry,
    groupBySections: boolean,
    parentPath = ''
  ): NavNode[] {
    const folders: FolderNode[] = [...dir.dirs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, entry]) => {
        const id = parentPath ? `${parentPath}/${label}` : label;
        return {
          kind: 'folder' as const,
          label,
          id,
          children: this.dirChildren(entry, groupBySections, id)
        };
      });

    const files: FileNode[] = dir.files
      .slice()
      .sort((a, b) =>
        (fileNames.get(a) ?? '').localeCompare(fileNames.get(b) ?? '')
      )
      .map((file) => {
        const requestCount = file.regions.filter((r) => r.kind === 'request').length;
        return {
          kind: 'file' as const,
          label: fileNames.get(file) ?? file.uri.fsPath,
          uri: file.uri,
          requestCount,
          expanded: false,
          children: buildFileChildren(file, groupBySections, this.store)
        };
      });

    return [...folders, ...files];
  }
}

// --- Current File tree provider (focused, sections expanded) -------------

export class CurrentFileTreeProvider implements vscode.TreeDataProvider<NavNode> {
  private readonly changeEmitter = new vscode.EventEmitter<NavNode | undefined | void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private roots: NavNode[] = [];
  private activeUri: vscode.Uri | undefined;

  constructor(
    private readonly index: WorkspaceIndex,
    private readonly store: FavoritesStore,
    private readonly extensionUri: vscode.Uri = vscode.Uri.file('')
  ) {
    index.onDidChange(() => this.refresh());
    store.onDidChange(() => this.refresh());
  }

  setActiveFile(uri: vscode.Uri | undefined): void {
    this.activeUri = uri;
    this.refresh();
  }

  refresh(): void {
    this.roots = this.buildCurrentFile();
    this.changeEmitter.fire();
  }

  getChildren(element?: NavNode): NavNode[] {
    if (!element) { return this.roots; }
    switch (element.kind) {
      case 'request':
      case 'stalePin':
        return [];
      default:
        return element.children;
    }
  }

  getTreeItem(node: NavNode): vscode.TreeItem {
    return buildNavTreeItem(node, this.extensionUri, true);
  }

  private buildCurrentFile(): NavNode[] {
    if (!this.activeUri) { return []; }
    const target = this.activeUri.toString();
    const file = this.index.getAll().find((f) => f.uri.toString() === target);
    if (!file) { return []; }
    const groupBySections = vscode.workspace
      .getConfiguration('httpyacPrimeNav')
      .get<boolean>('groupBySections', true);
    return buildFileChildren(file, groupBySections, this.store);
  }
}

// --- Shared file children builder ----------------------------------------

/** Build the section/request subtree for a single file. */
function buildFileChildren(
  file: ParsedFile,
  groupBySections: boolean,
  store: FavoritesStore
): NavNode[] {
  const roots: NavNode[] = [];

  if (!groupBySections) {
    for (const region of file.regions) {
      if (region.kind === 'request') {
        const key = computeKey(region, file.uri);
        roots.push({
          kind: 'request',
          uri: file.uri,
          line: region.requestLine,
          region,
          pinned: store.isPinned(key),
          key,
          source: 'tree'
        });
      }
    }
    return roots;
  }

  const stack: Array<{ level: number; node: SectionNode }> = [];
  const target = (): NavNode[] =>
    stack.length > 0 ? stack[stack.length - 1].node.children : roots;

  for (const region of file.regions) {
    if (region.kind === 'section') {
      while (stack.length > 0 && stack[stack.length - 1].level >= region.level) {
        stack.pop();
      }
      const node: SectionNode = {
        kind: 'section',
        label: region.label,
        id: `${file.uri.toString()}#section:${region.startLine}`,
        children: []
      };
      target().push(node);
      stack.push({ level: region.level, node });
    } else {
      const key = computeKey(region, file.uri);
      target().push({
        kind: 'request',
        uri: file.uri,
        line: region.requestLine,
        region,
        pinned: store.isPinned(key),
        key,
        source: 'tree'
      });
    }
  }
  return roots;
}
