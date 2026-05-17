import * as vscode from 'vscode';

export interface RevealArgs {
  uri: vscode.Uri;
  line: number;
}

/** Opens the file containing a request and selects its verb line. */
export function registerRevealCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'httpyac-primenav.reveal',
    async (args: RevealArgs) => {
      if (!args || !args.uri) {
        return;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(args.uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: true });
        const line = Math.max(0, Math.min(args.line ?? 0, doc.lineCount - 1));
        const range = doc.lineAt(line).range;
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      } catch (err) {
        console.error('httpyac-primenav: reveal failed', err);
        vscode.window.showWarningMessage(
          'httpYac PrimeNav: could not open the request location.'
        );
      }
    }
  );
}
