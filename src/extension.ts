import * as vscode from 'vscode';
import { WorkspaceIndex } from './workspace/workspaceIndex';
import { RequestsTreeProvider, CurrentFileTreeProvider } from './tree/treeProvider';
import { registerSearchCommand } from './search/quickPick';
import { registerRevealCommand } from './commands/revealRequest';
import { registerSendCommand } from './commands/sendRequest';
import { registerRunFileTestsCommand } from './commands/runFileTests';
import { FavoritesStore } from './state/favoritesStore';
import { computeKey } from './state/requestKey';
import { displayLabel } from './types';
import { RequestNode, StalePinNode } from './tree/treeItems';

function isHttpRequestFile(uri: vscode.Uri | undefined): uri is vscode.Uri {
  return !!uri && /\.(http|rest)$/i.test(uri.fsPath);
}

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const index = new WorkspaceIndex();
  await index.init();
  ctx.subscriptions.push(index);

  const store = new FavoritesStore(ctx.workspaceState);
  ctx.subscriptions.push(store);

  const tree = new RequestsTreeProvider(index, store, ctx.extensionUri);
  const treeView = vscode.window.createTreeView('httpyacPrimeNav.tree', {
    treeDataProvider: tree,
    showCollapseAll: true
  });

  const currentFileTree = new CurrentFileTreeProvider(index, store, ctx.extensionUri);
  const currentFileTreeView = vscode.window.createTreeView('httpyacPrimeNav.currentFileTree', {
    treeDataProvider: currentFileTree,
    showCollapseAll: false
  });

  const revealActiveRequestFile = (): void => {
    const uri = vscode.window.activeTextEditor?.document.uri;
    if (!isHttpRequestFile(uri)) { return; }
    const node = tree.findFileNode(uri);
    if (!node) { return; }
    void treeView
      .reveal(node, { expand: true, focus: false, select: false })
      .then(undefined, () => undefined);
  };

  // Update current-file view + context key, then re-reveal workspace tree
  const syncActiveHttpFile = (uri: vscode.Uri | undefined): void => {
    const isHttp = isHttpRequestFile(uri);
    vscode.commands.executeCommand('setContext', 'httpyac-primenav.activeHttpFile', isHttp);
    currentFileTree.setActiveFile(isHttp ? uri : undefined);
    revealActiveRequestFile();
  };

  // Fix: re-reveal after tree data changes — catches re-parses triggered by
  // file saves/changes where the active editor didn't switch but the index updated.
  ctx.subscriptions.push(tree.onDidChangeTreeData(() => revealActiveRequestFile()));

  ctx.subscriptions.push(
    treeView,
    currentFileTreeView,
    vscode.commands.registerCommand('httpyac-primenav.refresh', () => {
      tree.refresh();
      currentFileTree.refresh();
      revealActiveRequestFile();
    }),
    vscode.window.onDidChangeActiveTextEditor((e) => syncActiveHttpFile(e?.document.uri)),
    registerSearchCommand(index, store, ctx.extensionUri),
    registerRevealCommand(),
    registerSendCommand(),
    registerRunFileTestsCommand(() => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      return isHttpRequestFile(uri) ? uri : undefined;
    })
  );

  // Initialize both views with the current editor state on activation
  syncActiveHttpFile(vscode.window.activeTextEditor?.document.uri);

  // Pin command — receives a RequestNode from tree item context
  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      'httpyac-primenav.pin',
      (node: RequestNode) => {
        if (!node?.region) { return; }
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

  // Unpin command — same shape as pin; togglePin handles both directions
  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      'httpyac-primenav.unpin',
      (node: RequestNode) => {
        if (!node?.region) { return; }
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

  // Remove stale pin — receives a StalePinNode from tree item context
  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      'httpyac-primenav.removePin',
      (node: StalePinNode) => {
        if (!node?.entry?.key) { return; }
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
