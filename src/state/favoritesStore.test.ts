import { FakeMemento } from '../test/vscode-mock';
import { FavoritesStore } from './favoritesStore';

function makeStore(memento = new FakeMemento()) {
  return { store: new FavoritesStore(memento), memento };
}

const snap = (n: number) => ({
  label: `request-${n}`,
  method: 'GET',
  url: `https://example.com/${n}`,
  uri: 'file:///workspace/a.http'
});

describe('FavoritesStore', () => {
  it('1. starts empty', () => {
    const { store } = makeStore();
    expect(store.pinned()).toEqual([]);
    expect(store.isPinned('name:file:///workspace/a.http#login')).toBe(false);
  });

  it('2. togglePin adds an entry', () => {
    const { store } = makeStore();
    store.togglePin('key-a', snap(1));
    expect(store.pinned()).toHaveLength(1);
    expect(store.pinned()[0]).toMatchObject({ key: 'key-a', label: 'request-1' });
    expect(store.isPinned('key-a')).toBe(true);
  });

  it('3. togglePin on an already-pinned key removes it', () => {
    const { store } = makeStore();
    store.togglePin('key-a', snap(1));
    store.togglePin('key-a', snap(1));
    expect(store.pinned()).toHaveLength(0);
    expect(store.isPinned('key-a')).toBe(false);
  });

  it('4. multiple pins are ordered append-on-pin', () => {
    const { store } = makeStore();
    store.togglePin('key-a', snap(1));
    store.togglePin('key-b', snap(2));
    store.togglePin('key-c', snap(3));
    const keys = store.pinned().map((e) => e.key);
    expect(keys).toEqual(['key-a', 'key-b', 'key-c']);
  });

  it('5. removing middle pin preserves order of others', () => {
    const { store } = makeStore();
    store.togglePin('key-a', snap(1));
    store.togglePin('key-b', snap(2));
    store.togglePin('key-c', snap(3));
    store.removePin('key-b');
    expect(store.pinned().map((e) => e.key)).toEqual(['key-a', 'key-c']);
  });

  it('6. removePin on a non-existent key is a no-op', () => {
    const { store } = makeStore();
    store.togglePin('key-a', snap(1));
    store.removePin('key-x');
    expect(store.pinned()).toHaveLength(1);
  });

  it('7. persistence shape round-trips through Memento', async () => {
    const memento = new FakeMemento();
    const { store: s1 } = makeStore(memento);
    s1.togglePin('key-a', snap(1));

    // New store instance over same memento simulates reload
    const s2 = new FavoritesStore(memento);
    expect(s2.pinned()).toHaveLength(1);
    expect(s2.pinned()[0]).toMatchObject({ key: 'key-a', label: 'request-1' });
  });

  it('8. onDidChange fires on togglePin and removePin', () => {
    const { store } = makeStore();
    const listener = jest.fn();
    store.onDidChange(listener);
    store.togglePin('key-a', snap(1));
    expect(listener).toHaveBeenCalledTimes(1);
    store.removePin('key-a');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('9. isPinned does not match partial keys', () => {
    const { store } = makeStore();
    store.togglePin('name:file:///a.http#login', snap(1));
    expect(store.isPinned('name:file:///a.http#log')).toBe(false);
    expect(store.isPinned('name:file:///a.http#loginExtra')).toBe(false);
  });
});
