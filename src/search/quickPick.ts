import * as vscode from 'vscode';
import { IndexedRequest, WorkspaceIndex } from '../workspace/workspaceIndex';
import { methodCodicon } from '../icons/methodIcon';
import { displayLabel } from '../types';
import { FavoritesStore } from '../state/favoritesStore';
import { computeKey } from '../state/requestKey';

interface RequestPickItem extends vscode.QuickPickItem {
  /** undefined for separator items */
  uri?: vscode.Uri;
  line?: number;
  /** The request key, used for pin/unpin. */
  key?: string;
  pinned?: boolean;
}

type SearchScope = 'workspace' | 'file';

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function isHttpFile(uri: vscode.Uri | undefined): uri is vscode.Uri {
  return !!uri && /\.(http|rest)$/i.test(uri.fsPath);
}

/** Registers the workspace-wide fuzzy request search command. */
export function registerSearchCommand(
  index: WorkspaceIndex,
  store: FavoritesStore
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'httpyac-primenav.search',
    (arg?: { scope?: SearchScope }) => {
    // Captured once — the QuickPick steals focus, so the "current file"
    // is whatever editor was active when search opened.
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    const fileScopeUri = isHttpFile(activeUri) ? activeUri : undefined;

    const quickPick = vscode.window.createQuickPick<RequestPickItem>();
    quickPick.placeholder = 'Filter by method, name, file path or URL';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    const httpyacAvailable = !!vscode.extensions.getExtension('anweber.vscode-httpyac');
    const sendButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('play'),
      tooltip: 'Send via httpYac'
    };
    const pinButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('pin'),
      tooltip: 'Pin request'
    };
    const unpinButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('pinned'),
      tooltip: 'Unpin request'
    };
    const fileScopeButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('file'),
      tooltip: 'Scope: current file — switch to whole workspace'
    };
    const workspaceScopeButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('globe'),
      tooltip: 'Scope: whole workspace — switch to current file'
    };

    // An explicit scope from a keybinding wins; otherwise default to the
    // current file when search opens from an .http editor.
    let scope: SearchScope = arg?.scope ?? (fileScopeUri ? 'file' : 'workspace');
    if (scope === 'file' && !fileScopeUri) {
      scope = 'workspace';
    }

    const toItem = ({ file, region }: IndexedRequest): RequestPickItem => {
      const method = region.method ?? '';
      const key = computeKey(region, file.uri);
      const isPinned = store.isPinned(key);
      const itemButtons: vscode.QuickInputButton[] = [
        isPinned ? unpinButton : pinButton,
        ...(httpyacAvailable ? [sendButton] : [])
      ];
      return {
        label: `${methodCodicon(region.method, region.disabled)} ${method} ${displayLabel(region)}`
          .replace(/\s+/g, ' ')
          .trim(),
        description: isPinned
          ? `Pinned · ${vscode.workspace.asRelativePath(file.uri)}`
          : vscode.workspace.asRelativePath(file.uri),
        detail: region.url ? truncate(region.url, 120) : undefined,
        buttons: itemButtons,
        uri: file.uri,
        line: region.requestLine,
        key,
        pinned: isPinned
      };
    };

    const render = (filterText: string): void => {
      const all = index.getAllRequests();
      const requests =
        scope === 'file' && fileScopeUri
          ? all.filter((r) => r.file.uri.toString() === fileScopeUri.toString())
          : all;

      const allItems = requests.map(toItem);

      if (!filterText) {
        // Prepend a "Pinned" section when search box is empty. It follows the
        // same scope as the rest of the picker: current file or workspace.
        const itemByKey = new Map(
          allItems
            .filter((i): i is RequestPickItem & { key: string } => i.key !== undefined)
            .map((i) => [i.key, i])
        );
        const pinnedItems = store.pinned()
          .map((entry) => itemByKey.get(entry.key))
          .filter((i): i is RequestPickItem & { key: string } => i !== undefined)
          .map((i): RequestPickItem => ({ ...i, label: i.label }));
        if (pinnedItems.length > 0) {
          const pinnedSeparator: RequestPickItem = {
            label: 'Pinned requests',
            kind: vscode.QuickPickItemKind.Separator
          };
          const allSeparator: RequestPickItem = {
            label: 'All requests',
            kind: vscode.QuickPickItemKind.Separator
          };
          const unpinnedItems = allItems.filter((i) => !i.key || !store.isPinned(i.key));
          quickPick.items = [
            pinnedSeparator,
            ...pinnedItems,
            allSeparator,
            ...unpinnedItems
          ];
        } else {
          quickPick.items = allItems;
        }
      } else {
        // While typing, show the flat list so VS Code fuzzy match works cleanly.
        quickPick.items = allItems;
      }

      quickPick.title =
        scope === 'file'
          ? 'Search Requests — Current File'
          : 'Search Requests — Workspace';
      // The scope toggle is only meaningful when an .http file is active.
      quickPick.buttons = fileScopeUri
        ? [scope === 'file' ? fileScopeButton : workspaceScopeButton]
        : [];
    };

    render('');

    quickPick.onDidChangeValue((value) => {
      render(value);
    });

    quickPick.onDidTriggerButton(() => {
      scope = scope === 'file' ? 'workspace' : 'file';
      render(quickPick.value);
    });

    quickPick.onDidAccept(() => {
      const item = quickPick.selectedItems[0];
      if (item?.uri !== undefined) {
        vscode.commands.executeCommand('httpyac-primenav.reveal', {
          uri: item.uri,
          line: item.line
        });
      }
      quickPick.hide();
    });

    quickPick.onDidTriggerItemButton((event) => {
      const item = event.item;
      if (event.button === sendButton && item.uri !== undefined) {
        vscode.commands.executeCommand('httpyac-primenav.send', {
          uri: item.uri,
          line: item.line
        });
        quickPick.hide();
        return;
      }
      // pin or unpin button
      if (item.key !== undefined && item.uri !== undefined) {
        const { region } = index.getAllRequests().find(
          (r) => computeKey(r.region, r.file.uri) === item.key
        ) ?? {};
        if (region) {
          store.togglePin(item.key, {
            label: displayLabel(region),
            method: region.method,
            url: region.url,
            uri: item.uri.toString()
          });
          // Re-render in place so the button icon flips.
          render(quickPick.value);
        }
      }
    });

    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
  });
}
