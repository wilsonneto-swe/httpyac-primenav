import * as vscode from 'vscode';
import { parseHttpFile } from '../parser/httpFileParser';
import { ParsedFile, RequestRegion } from '../types';

const DEBOUNCE_MS = 150;

/** Request paired with the file it lives in — used by tree and search. */
export interface IndexedRequest {
  file: ParsedFile;
  region: RequestRegion;
}

/**
 * Discovers every `.http` / `.rest` file in the workspace, parses them and
 * keeps the result cached, reacting to file-system and editor changes.
 */
export class WorkspaceIndex implements vscode.Disposable {
  private readonly files = new Map<string, ParsedFile>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly emitter = new vscode.EventEmitter<void>();

  readonly onDidChange: vscode.Event<void> = this.emitter.event;

  async init(): Promise<void> {
    const glob = this.fileGlob();
    const uris = await vscode.workspace.findFiles(glob, this.excludeGlob());
    await Promise.all(uris.map((u) => this.parseUri(u)));

    const watcher = vscode.workspace.createFileSystemWatcher(glob);
    this.disposables.push(
      watcher,
      watcher.onDidCreate((u) => this.scheduleReparse(u)),
      watcher.onDidChange((u) => this.scheduleReparse(u)),
      watcher.onDidDelete((u) => this.remove(u)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.isHttpDocument(e.document)) {
          this.scheduleReparseText(e.document.uri, e.document.getText());
        }
      })
    );
  }

  getAll(): ParsedFile[] {
    return [...this.files.values()];
  }

  getByUri(uri: vscode.Uri): ParsedFile | undefined {
    return this.files.get(uri.toString());
  }

  /** Flat list of every request across every file, for search. */
  getAllRequests(): IndexedRequest[] {
    const out: IndexedRequest[] = [];
    for (const file of this.files.values()) {
      for (const region of file.regions) {
        if (region.kind === 'request') {
          out.push({ file, region });
        }
      }
    }
    return out;
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    for (const d of this.disposables.splice(0)) {
      d.dispose();
    }
    this.emitter.dispose();
  }

  private fileGlob(): string {
    return vscode.workspace
      .getConfiguration('httpyacPrimeNav')
      .get<string>('fileGlob', '**/*.{http,rest}');
  }

  private excludeGlob(): string {
    return vscode.workspace
      .getConfiguration('httpyacPrimeNav')
      .get<string>('excludeGlob', '**/node_modules/**');
  }

  private isHttpDocument(doc: vscode.TextDocument): boolean {
    return /\.(http|rest)$/i.test(doc.uri.fsPath);
  }

  private async parseUri(uri: vscode.Uri): Promise<void> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const text = new TextDecoder().decode(bytes);
      this.files.set(uri.toString(), parseHttpFile(text, uri));
    } catch (err) {
      console.error(`httpyac-primenav: failed to read ${uri.fsPath}`, err);
    }
  }

  private scheduleReparse(uri: vscode.Uri): void {
    this.debounce(uri.toString(), async () => {
      await this.parseUri(uri);
      this.emitter.fire();
    });
  }

  /** Reparse from in-memory editor text so the tree tracks unsaved edits. */
  private scheduleReparseText(uri: vscode.Uri, text: string): void {
    this.debounce(uri.toString(), () => {
      this.files.set(uri.toString(), parseHttpFile(text, uri));
      this.emitter.fire();
    });
  }

  private debounce(key: string, run: () => void | Promise<void>): void {
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    this.timers.set(
      key,
      setTimeout(async () => {
        this.timers.delete(key);
        await run();
      }, DEBOUNCE_MS)
    );
  }

  private remove(uri: vscode.Uri): void {
    const key = uri.toString();
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    if (this.files.delete(key)) {
      this.emitter.fire();
    }
  }
}
