import * as vscode from 'vscode';
import { WorkspaceIndex } from './workspace/workspaceIndex';
import { RequestsTreeProvider } from './tree/treeProvider';
import { registerSearchCommand } from './search/quickPick';
import { registerRevealCommand } from './commands/revealRequest';
import { registerSendCommand } from './commands/sendRequest';

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const index = new WorkspaceIndex();
  await index.init();
  ctx.subscriptions.push(index);

  const tree = new RequestsTreeProvider(index);
  const treeView = vscode.window.createTreeView('httpyacPrimeNav.tree', {
    treeDataProvider: tree,
    showCollapseAll: true
  });

  ctx.subscriptions.push(
    treeView,
    vscode.commands.registerCommand('httpyac-primenav.refresh', () => tree.refresh()),
    registerSearchCommand(index),
    registerRevealCommand(),
    registerSendCommand()
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
