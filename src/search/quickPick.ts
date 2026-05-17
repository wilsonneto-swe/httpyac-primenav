import * as vscode from 'vscode';
import { IndexedRequest, WorkspaceIndex } from '../workspace/workspaceIndex';
import { methodCodicon } from '../icons/methodIcon';
import { displayLabel } from '../types';

interface RequestPickItem extends vscode.QuickPickItem {
  uri: vscode.Uri;
  line: number;
}

type SearchScope = 'workspace' | 'file';

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function isHttpFile(uri: vscode.Uri | undefined): uri is vscode.Uri {
  return !!uri && /\.(http|rest)$/i.test(uri.fsPath);
}

/** Registers the workspace-wide fuzzy request search command. */
export function registerSearchCommand(index: WorkspaceIndex): vscode.Disposable {
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
    const fileScopeButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('file'),
      tooltip: 'Scope: current file — switch to whole workspace'
    };
    const workspaceScopeButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('globe'),
      tooltip: 'Scope: whole workspace — switch to current file'
    };

    // An explicit scope from a keybinding wins; otherwise default to the
    // current file when search opens from an .http editor. A "file" request
    // with no .http editor active falls back to the workspace.
    let scope: SearchScope = arg?.scope ?? (fileScopeUri ? 'file' : 'workspace');
    if (scope === 'file' && !fileScopeUri) {
      scope = 'workspace';
    }

    const toItem = ({ file, region }: IndexedRequest): RequestPickItem => {
      const method = region.method ?? '';
      return {
        label: `${methodCodicon(region.method, region.disabled)} ${method} ${displayLabel(region)}`
          .replace(/\s+/g, ' ')
          .trim(),
        description: vscode.workspace.asRelativePath(file.uri),
        detail: region.url ? truncate(region.url, 120) : undefined,
        buttons: httpyacAvailable ? [sendButton] : [],
        uri: file.uri,
        line: region.requestLine
      };
    };

    const render = (): void => {
      const all = index.getAllRequests();
      const requests =
        scope === 'file' && fileScopeUri
          ? all.filter((r) => r.file.uri.toString() === fileScopeUri.toString())
          : all;
      quickPick.items = requests.map(toItem);
      quickPick.title =
        scope === 'file'
          ? 'Search Requests — Current File'
          : 'Search Requests — Workspace';
      // The scope toggle is only meaningful when an .http file is active.
      quickPick.buttons = fileScopeUri
        ? [scope === 'file' ? fileScopeButton : workspaceScopeButton]
        : [];
    };

    render();

    quickPick.onDidTriggerButton(() => {
      scope = scope === 'file' ? 'workspace' : 'file';
      render();
    });

    quickPick.onDidAccept(() => {
      const item = quickPick.selectedItems[0];
      if (item) {
        vscode.commands.executeCommand('httpyac-primenav.reveal', {
          uri: item.uri,
          line: item.line
        });
      }
      quickPick.hide();
    });

    quickPick.onDidTriggerItemButton((event) => {
      vscode.commands.executeCommand('httpyac-primenav.send', {
        uri: event.item.uri,
        line: event.item.line
      });
      quickPick.hide();
    });

    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
  });
}
