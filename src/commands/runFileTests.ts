import * as vscode from 'vscode';
import { FileNode } from '../tree/treeItems';

export interface RunFileTestsArgs {
  uri: vscode.Uri;
}

function resolveUri(
  arg: FileNode | RunFileTestsArgs | undefined,
  activeHttpFile: () => vscode.Uri | undefined
): vscode.Uri | undefined {
  if (arg && 'kind' in arg && arg.kind === 'file') {
    return arg.uri;
  }
  if (arg && 'uri' in arg && arg.uri) {
    return arg.uri;
  }
  return activeHttpFile();
}

/**
 * Runs all httpYac tests in a file via VS Code's test runner (httpYac test controller).
 *
 * Delegates to `testing.runCurrentFile` with the file URI, matching the built-in
 * "Run Tests in Current File" action when httpYac has registered tests for that file.
 */
export function registerRunFileTestsCommand(
  activeHttpFile: () => vscode.Uri | undefined
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'httpyac-primenav.runFileTests',
    async (arg?: FileNode | RunFileTestsArgs) => {
      const uri = resolveUri(arg, activeHttpFile);
      if (!uri) {
        return;
      }
      if (!vscode.extensions.getExtension('anweber.vscode-httpyac')) {
        vscode.window.showWarningMessage(
          'httpYac PrimeNav: install the httpYac extension to run file tests.'
        );
        return;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: true });

        try {
          await vscode.commands.executeCommand('testing.runCurrentFile', uri);
        } catch (primaryErr) {
          try {
            await vscode.commands.executeCommand('testing.run.uri', uri);
          } catch (fallbackErr) {
            console.error('httpyac-primenav: run file tests failed', primaryErr, fallbackErr);
            vscode.window.showWarningMessage(
              'httpYac PrimeNav: could not run file tests. Ensure httpYac test support is enabled.'
            );
          }
        }
      } catch (err) {
        console.error('httpyac-primenav: run file tests failed', err);
        vscode.window.showWarningMessage(
          'httpYac PrimeNav: could not open the file to run tests.'
        );
      }
    }
  );
}
