import * as vscode from 'vscode';
import { WorkspaceIndex } from '../workspace/workspaceIndex';
import { ParsedFile, displayLabel } from '../types';
import { methodIcon } from '../icons/methodIcon';
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

/** Above this many files, file nodes start collapsed. */
const COLLAPSE_FILE_THRESHOLD = 5;

interface DirEntry {
  dirs: Map<string, DirEntry>;
  files: ParsedFile[];
}

export class RequestsTreeProvider implements vscode.TreeDataProvider<NavNode> {
  private readonly changeEmitter = new vscode.EventEmitter<NavNode | undefined | void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private roots: NavNode[] = [];

  constructor(
    private readonly index: WorkspaceIndex,
    private readonly store: FavoritesStore
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
    if (!element) {
      return this.roots;
    }
    switch (element.kind) {
      case 'request':
      case 'stalePin':
        return [];
      default:
        return element.children;
    }
  }

  getTreeItem(node: NavNode): vscode.TreeItem {
    switch (node.kind) {
      case 'group':
        return this.groupItem(node);
      case 'folder':
        return this.folderItem(node);
      case 'file':
        return this.fileItem(node);
      case 'section':
        return this.sectionItem(node);
      case 'request':
        return this.requestItem(node);
      case 'stalePin':
        return this.stalePinItem(node);
    }
  }

  // --- tree item construction -------------------------------------------

  private groupItem(node: GroupNode): vscode.TreeItem {
    const item = new vscode.TreeItem('Pinned', vscode.TreeItemCollapsibleState.Expanded);
    item.id = `group:${node.id}`;
    item.iconPath = new vscode.ThemeIcon('pinned');
    item.contextValue = 'group-pinned';
    return item;
  }

  private folderItem(node: FolderNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.label,
      vscode.TreeItemCollapsibleState.Expanded
    );
    item.id = `folder:${node.id}`;
    item.iconPath = vscode.ThemeIcon.Folder;
    item.contextValue = 'folder';
    return item;
  }

  private fileItem(node: FileNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.label,
      node.expanded
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed
    );
    item.id = `file:${node.uri.toString()}`;
    item.resourceUri = node.uri;
    item.iconPath = vscode.ThemeIcon.File;
    item.description = `${node.requestCount} request${node.requestCount === 1 ? '' : 's'}`;
    item.contextValue = 'file';
    item.tooltip = node.uri.fsPath;
    return item;
  }

  private sectionItem(node: SectionNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.label,
      vscode.TreeItemCollapsibleState.Expanded
    );
    item.id = `section:${node.id}`;
    item.iconPath = new vscode.ThemeIcon('symbol-namespace');
    item.contextValue = 'section';
    return item;
  }

  private requestItem(node: RequestNode): vscode.TreeItem {
    const { region } = node;
    const item = new vscode.TreeItem(
      displayLabel(region),
      vscode.TreeItemCollapsibleState.None
    );
    item.id = `request:${node.source}:${node.key}`;
    item.iconPath = methodIcon(region.method, region.disabled);
    item.contextValue = node.pinned ? 'request-pinned' : 'request';

    const descParts: string[] = [];
    if (node.pinned) {
      descParts.push('$(pinned)');
    }
    if (region.method && !displayLabel(region).startsWith(region.method)) {
      descParts.push(region.method);
    }
    if (region.disabled) {
      descParts.push('(disabled)');
    }
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

  private stalePinItem(node: StalePinNode): vscode.TreeItem {
    const { entry } = node;
    const label = entry.label;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.id = `stalePin:${entry.key}`;
    item.description = '(missing)';
    item.tooltip = `${entry.method ?? ''} ${entry.url ?? ''}`.trim() || entry.uri;
    item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
    item.contextValue = 'stale-pin';
    return item;
  }

  // --- tree construction ------------------------------------------------

  private build(): NavNode[] {
    const files = this.index.getAll();
    const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    const collapseFiles = files.length > COLLAPSE_FILE_THRESHOLD;
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

    const fileTree = this.dirChildren(root, groupBySections, collapseFiles);

    if (!showPinned) {
      return fileTree;
    }

    const pinned = this.store.pinned();
    if (pinned.length === 0) {
      return fileTree;
    }

    // Build a lookup: key → RequestNode (from the live index)
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
      if (node) {
        return node;
      }
      return { kind: 'stalePin', entry } satisfies StalePinNode;
    });

    const group: GroupNode = { kind: 'group', id: 'pinned', children: pinnedChildren };
    return [group, ...fileTree];
  }

  private dirChildren(
    dir: DirEntry,
    groupBySections: boolean,
    collapseFiles: boolean,
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
          children: this.dirChildren(entry, groupBySections, collapseFiles, id)
        };
      });

    const files: FileNode[] = dir.files
      .slice()
      .sort((a, b) =>
        (fileNames.get(a) ?? '').localeCompare(fileNames.get(b) ?? '')
      )
      .map((file) => {
        const requestCount = file.regions.filter(
          (r) => r.kind === 'request'
        ).length;
        return {
          kind: 'file' as const,
          label: fileNames.get(file) ?? file.uri.fsPath,
          uri: file.uri,
          requestCount,
          expanded: !collapseFiles,
          children: buildFileChildren(file, groupBySections, this.store)
        };
      });

    return [...folders, ...files];
  }
}

/** Per-build cache of display file names, keyed by ParsedFile identity. */
const fileNames = new WeakMap<ParsedFile, string>();

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
