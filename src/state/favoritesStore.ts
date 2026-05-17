import * as vscode from 'vscode';

/** Minimal snapshot stored alongside a pin so stale entries can still render. */
export interface PinnedEntry {
  key: string;
  label: string;
  method?: string;
  url?: string;
  /** Stringified URI of the file containing this request. */
  uri: string;
}

const STORAGE_KEY = 'httpyacPrimeNav.pinned';

/**
 * Persists the user's pinned requests in `workspaceState`.
 *
 * Order is append-on-pin (most-recently-pinned last). Calling `togglePin`
 * on an already-pinned key removes it.
 */
export class FavoritesStore implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange: vscode.Event<void> = this.emitter.event;

  constructor(private readonly state: vscode.Memento) {}

  pinned(): PinnedEntry[] {
    return this.state.get<PinnedEntry[]>(STORAGE_KEY, []);
  }

  isPinned(key: string): boolean {
    return this.pinned().some((e) => e.key === key);
  }

  togglePin(key: string, snapshot: Omit<PinnedEntry, 'key'>): void {
    const current = this.pinned();
    const idx = current.findIndex((e) => e.key === key);
    if (idx !== -1) {
      current.splice(idx, 1);
    } else {
      current.push({ key, ...snapshot });
    }
    this.save(current);
  }

  removePin(key: string): void {
    const current = this.pinned().filter((e) => e.key !== key);
    this.save(current);
  }

  dispose(): void {
    this.emitter.dispose();
  }

  private save(entries: PinnedEntry[]): void {
    void this.state.update(STORAGE_KEY, entries);
    this.emitter.fire();
  }
}
