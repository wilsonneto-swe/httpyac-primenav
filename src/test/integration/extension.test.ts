import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'wilsonneto-swe.httpyac-primenav';

async function activate() {
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(ext, 'extension should be present');
  await ext!.activate();
  return ext!;
}

suite('httpYac PrimeNav — smoke test', () => {
  test('activates and registers its commands', async () => {
    const ext = await activate();
    assert.ok(ext.isActive, 'extension should activate');

    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'httpyac-primenav.search',
      'httpyac-primenav.refresh',
      'httpyac-primenav.reveal',
      'httpyac-primenav.send',
      'httpyac-primenav.runFileTests',
      'httpyac-primenav.pin',
      'httpyac-primenav.unpin',
      'httpyac-primenav.removePin'
    ]) {
      assert.ok(commands.includes(id), `command ${id} should be registered`);
    }
  });

  test('discovers the two fixture request files', async () => {
    const files = await vscode.workspace.findFiles(
      '**/*.{http,rest}',
      '**/node_modules/**'
    );
    assert.strictEqual(files.length, 2, 'fixture workspace has two request files');
  });

  test('search command opens the quick pick without throwing', async () => {
    await vscode.commands.executeCommand('httpyac-primenav.search');
    await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
  });

  test('pin and unpin commands execute without throwing', async () => {
    await activate();
    // The commands accept a RequestNode-shaped argument. When called with an
    // undefined/null arg they should silently no-op (guarded in extension.ts).
    await vscode.commands.executeCommand('httpyac-primenav.pin', undefined);
    await vscode.commands.executeCommand('httpyac-primenav.unpin', undefined);
    await vscode.commands.executeCommand('httpyac-primenav.removePin', undefined);
  });

  test('run file tests command executes without throwing when called with no arg', async () => {
    await activate();
    await vscode.commands.executeCommand('httpyac-primenav.runFileTests', undefined);
  });
});
