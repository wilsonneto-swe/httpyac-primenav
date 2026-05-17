import * as vscode from 'vscode';

interface SendArgs {
  uri: vscode.Uri;
  line: number;
}

/**
 * Delegates request execution to the httpYac extension.
 *
 * httpYac is a navigation-only extension — it does not run HTTP itself.
 */
export function registerSendCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'httpyac-primenav.send',
    async (args: SendArgs) => {
      if (!args || !args.uri) {
        return;
      }
      if (!vscode.extensions.getExtension('anweber.vscode-httpyac')) {
        vscode.window.showWarningMessage(
          'httpYac PrimeNav: install the httpYac extension to send requests.'
        );
        return;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(args.uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: true });
        const line = Math.max(0, Math.min(args.line ?? 0, doc.lineCount - 1));
        const range = doc.lineAt(line).range;
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

        await vscode.commands.executeCommand('httpyac.send', args.uri, {
          line
        });
      } catch (err) {
        console.error('httpyac-primenav: httpyac.send failed', err);
        vscode.window.showWarningMessage(
          'httpYac PrimeNav: could not send the request via httpYac.'
        );
      }
    }
  );
}
