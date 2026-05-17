/**
 * Minimal in-memory `vscode` API fake for jest unit tests.
 *
 * It implements just enough surface for the parser and the workspace index.
 * Tests drive it through the exported `__test` hooks.
 */
import * as nodePath from 'path';

export class Uri {
  private constructor(public readonly fsPath: string) {}
  static file(p: string): Uri {
    return new Uri(p);
  }
  static parse(value: string): Uri {
    return new Uri(value.replace(/^file:\/\//, ''));
  }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(nodePath.join(base.fsPath, ...segments));
  }
  get path(): string {
    return this.fsPath;
  }
  get scheme(): string {
    return 'file';
  }
  toString(): string {
    return `file://${this.fsPath}`;
  }
}

export class EventEmitter<T> {
  private listeners = new Set<(e: T) => void>();
  event = (listener: (e: T) => void) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };
  fire(data: T): void {
    for (const l of [...this.listeners]) {
      l(data);
    }
  }
  dispose(): void {
    this.listeners.clear();
  }
}

export class Disposable {
  constructor(private readonly callOnDispose: () => void) {}
  dispose(): void {
    this.callOnDispose();
  }
  static from(...items: { dispose: () => void }[]): Disposable {
    return new Disposable(() => items.forEach((i) => i.dispose()));
  }
}

interface FakeWatcher {
  create: EventEmitter<Uri>;
  change: EventEmitter<Uri>;
  delete: EventEmitter<Uri>;
}

const state = {
  files: new Map<string, string>(),
  watchers: [] as FakeWatcher[]
};

export const workspace = {
  workspaceFolders: [{ uri: Uri.file('/workspace'), name: 'workspace', index: 0 }],

  async findFiles(): Promise<Uri[]> {
    return [...state.files.keys()].map((p) => Uri.file(p));
  },

  fs: {
    async readFile(uri: Uri): Promise<Uint8Array> {
      const content = state.files.get(uri.fsPath);
      if (content === undefined) {
        throw new Error(`ENOENT: ${uri.fsPath}`);
      }
      return new TextEncoder().encode(content);
    }
  },

  createFileSystemWatcher() {
    const watcher: FakeWatcher = {
      create: new EventEmitter<Uri>(),
      change: new EventEmitter<Uri>(),
      delete: new EventEmitter<Uri>()
    };
    state.watchers.push(watcher);
    return {
      onDidCreate: watcher.create.event,
      onDidChange: watcher.change.event,
      onDidDelete: watcher.delete.event,
      dispose: () => {
        watcher.create.dispose();
        watcher.change.dispose();
        watcher.delete.dispose();
      }
    };
  },

  onDidChangeTextDocument: new EventEmitter<unknown>().event,

  getConfiguration() {
    return {
      get: <T>(_key: string, defaultValue: T): T => defaultValue
    };
  },

  asRelativePath(uri: Uri): string {
    return uri.fsPath.replace(/^\/workspace\//, '');
  }
};

export const window = {
  showWarningMessage: (..._args: unknown[]) => Promise.resolve(undefined),
  showErrorMessage: (..._args: unknown[]) => Promise.resolve(undefined)
};

export const commands = {
  executeCommand: (..._args: unknown[]) => Promise.resolve(undefined)
};

/** Test-only hooks for driving the fake. */
export const __test = {
  reset(): void {
    state.files.clear();
    state.watchers = [];
  },
  setFile(path: string, content: string): void {
    state.files.set(path, content);
  },
  deleteFile(path: string): void {
    state.files.delete(path);
  },
  /** The most recently created watcher (the one a WorkspaceIndex wires up). */
  watcher(): FakeWatcher {
    const w = state.watchers[state.watchers.length - 1];
    if (!w) {
      throw new Error('no watcher created yet');
    }
    return w;
  }
};
