import * as vscode from 'vscode';
import { WorkspaceIndex } from './workspace/workspaceIndex';
import { RequestsTreeProvider } from './tree/treeProvider';
import { registerSearchCommand } from './search/quickPick';
import { registerRevealCommand } from './commands/revealRequest';
import { registerSendCommand } from './commands/sendRequest';
import { FavoritesStore } from './state/favoritesStore';
import { computeKey } from './state/requestKey';
import { displayLabel } from './types';
import { RequestNode, StalePinNode } from './tree/treeItems';

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const index = new WorkspaceIndex();
  await index.init();
  ctx.subscriptions.push(index);

  const store = new FavoritesStore(ctx.workspaceState);
  ctx.subscriptions.push(store);

  const tree = new RequestsTreeProvider(index, store);
  const treeView = vscode.window.createTreeView('httpyacPrimeNav.tree', {
    treeDataProvider: tree,
    showCollapseAll: true
  });

  ctx.subscriptions.push(
    treeView,
    vscode.commands.registerCommand('httpyac-primenav.refresh', () => tree.refresh()),
    registerSearchCommand(index, store),
    registerRevealCommand(),
    registerSendCommand()
  );

  // Pin command — receives a RequestNode from tree item context.
  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      'httpyac-primenav.pin',
      (node: RequestNode) => {
        if (!node?.region) {
          return;
        }
        const key = node.key ?? computeKey(node.region, node.uri);
        store.togglePin(key, {
          label: displayLabel(node.region),
          method: node.region.method,
          url: node.region.url,
          uri: node.uri.toString()
        });
      }
    )
  );

  // Unpin command — same shape as pin; togglePin handles both directions.
  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      'httpyac-primenav.unpin',
      (node: RequestNode) => {
        if (!node?.region) {
          return;
        }
        const key = node.key ?? computeKey(node.region, node.uri);
        store.togglePin(key, {
          label: displayLabel(node.region),
          method: node.region.method,
          url: node.region.url,
          uri: node.uri.toString()
        });
      }
    )
  );

  // Remove stale pin — receives a StalePinNode from tree item context.
  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      'httpyac-primenav.removePin',
      (node: StalePinNode) => {
        if (!node?.entry?.key) {
          return;
        }
        store.removePin(node.entry.key);
      }
    )
  );

  const syncHttpyacContext = (): void => {
    const httpyac = vscode.extensions.getExtension('anweber.vscode-httpyac');
    vscode.commands.executeCommand(
      'setContext',
      'httpyac-primenav.httpyacAvailable',
      !!httpyac
    );
  };
  syncHttpyacContext();
  ctx.subscriptions.push(vscode.extensions.onDidChange(syncHttpyacContext));
}

export function deactivate(): void {
  // no-op — disposables are released via ctx.subscriptions
}
