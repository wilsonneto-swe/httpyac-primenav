import * as vscodeMock from '../test/vscode-mock';
import { __test, FakeMemento } from '../test/vscode-mock';
import { WorkspaceIndex } from '../workspace/workspaceIndex';
import { RequestsTreeProvider } from './treeProvider';
import { FavoritesStore } from '../state/favoritesStore';
import { NavNode, GroupNode, RequestNode } from './treeItems';

const FILE_A = '/workspace/a.http';

beforeEach(() => {
  __test.reset();
});

async function makeProvider(storeMemento = new FakeMemento()) {
  const index = new WorkspaceIndex();
  await index.init(); // must come before provider so build() sees the data
  const store = new FavoritesStore(storeMemento);
  const provider = new RequestsTreeProvider(index, store);
  return { index, store, provider };
}

describe('RequestsTreeProvider', () => {
  it('1. returns file nodes when no pins exist', async () => {
    __test.setFile(FILE_A, 'GET https://example.com/health');
    const { provider, index } = await makeProvider();

    const roots = provider.getChildren();
    expect(roots).toHaveLength(1);
    expect(roots[0].kind).toBe('file');

    index.dispose();
  });

  it('2. prepends a Pinned group when store has entries', async () => {
    __test.setFile(FILE_A, '### login\n# @name login\nPOST https://example.com/login');
    const memento = new FakeMemento();
    const { provider, index, store } = await makeProvider(memento);

    // Pin the login request manually
    store.togglePin('name:file:///workspace/a.http#login', {
      label: 'login',
      method: 'POST',
      url: 'https://example.com/login',
      uri: 'file:///workspace/a.http'
    });

    // Rebuild after the store change fires
    const roots = provider.getChildren();
    expect(roots[0].kind).toBe('group');
    expect((roots[0] as GroupNode).id).toBe('pinned');

    index.dispose();
  });

  it('3. pinned group is absent when showPinned setting is false', async () => {
    __test.setFile(FILE_A, '### login\n# @name login\nPOST https://example.com/login');
    const origGetConfig = vscodeMock.workspace.getConfiguration;
    vscodeMock.workspace.getConfiguration = () => ({
      get: <T>(key: string, def: T): T => (key === 'showPinned' ? (false as unknown as T) : def)
    });

    const memento = new FakeMemento();
    const { provider, index, store } = await makeProvider(memento);

    store.togglePin('name:file:///workspace/a.http#login', {
      label: 'login',
      method: 'POST',
      url: 'https://example.com/login',
      uri: 'file:///workspace/a.http'
    });

    const roots = provider.getChildren();
    expect(roots[0].kind).not.toBe('group');

    vscodeMock.workspace.getConfiguration = origGetConfig;
    index.dispose();
  });

  it('4. resolved pin appears in the pinned group as a RequestNode with pinned=true', async () => {
    __test.setFile(FILE_A, '### login\n# @name login\nPOST https://example.com/login');
    const memento = new FakeMemento();
    const { provider, index, store } = await makeProvider(memento);

    store.togglePin('name:file:///workspace/a.http#login', {
      label: 'login',
      method: 'POST',
      url: 'https://example.com/login',
      uri: 'file:///workspace/a.http'
    });

    const roots = provider.getChildren();
    const group = roots[0] as GroupNode;
    const pinnedChildren = provider.getChildren(group);
    expect(pinnedChildren).toHaveLength(1);
    expect(pinnedChildren[0].kind).toBe('request');
    expect((pinnedChildren[0] as RequestNode).pinned).toBe(true);

    index.dispose();
  });

  it('5. unresolvable pin renders as a stalePin node', async () => {
    __test.setFile(FILE_A, 'GET https://example.com/health');
    const memento = new FakeMemento();
    const { provider, index, store } = await makeProvider(memento);

    // Pin a key that has no matching request in the index
    store.togglePin('name:file:///workspace/a.http#nonexistent', {
      label: 'nonexistent',
      method: 'GET',
      url: 'https://example.com/nonexistent',
      uri: 'file:///workspace/a.http'
    });

    const roots = provider.getChildren();
    const group = roots[0] as GroupNode;
    const pinnedChildren = provider.getChildren(group);
    expect(pinnedChildren[0].kind).toBe('stalePin');

    index.dispose();
  });

  it('6. request nodes in file tree carry stable ids', async () => {
    __test.setFile(FILE_A, '### health\n# @name health\nGET https://example.com/health');
    const { provider, index } = await makeProvider();

    const roots = provider.getChildren();
    // roots[0] is the file node
    const fileChildren = provider.getChildren(roots[0]);
    const reqNode = fileChildren[0] as RequestNode;
    expect(reqNode.key).toBe('name:file:///workspace/a.http#health');

    const item = provider.getTreeItem(reqNode);
    expect(item.id).toBe('request:tree:name:file:///workspace/a.http#health');

    // Rebuild (simulating a file change) and check the id is the same
    provider.refresh();
    const roots2 = provider.getChildren();
    const fileChildren2 = provider.getChildren(roots2[0]);
    const reqNode2 = fileChildren2[0] as RequestNode;
    expect(provider.getTreeItem(reqNode2).id).toBe(item.id);

    index.dispose();
  });

  it('7. request node in file tree reflects pinned=true after pin', async () => {
    __test.setFile(FILE_A, '### login\n# @name login\nPOST https://example.com/login');
    const { provider, index, store } = await makeProvider();

    let roots = provider.getChildren();
    let fileChildren = provider.getChildren(roots[0]);
    expect((fileChildren[0] as RequestNode).pinned).toBe(false);

    store.togglePin('name:file:///workspace/a.http#login', {
      label: 'login',
      method: 'POST',
      url: 'https://example.com/login',
      uri: 'file:///workspace/a.http'
    });

    roots = provider.getChildren();
    // roots[0] is now the group; roots[1] is the file node
    const fileNode = roots.find((n: NavNode) => n.kind === 'file')!;
    fileChildren = provider.getChildren(fileNode);
    expect((fileChildren[0] as RequestNode).pinned).toBe(true);

    index.dispose();
  });

  it('8. pinned alias and file-tree request have distinct ids', async () => {
    __test.setFile(FILE_A, '### login\n# @name login\nPOST https://example.com/login');
    const { provider, index, store } = await makeProvider();

    store.togglePin('name:file:///workspace/a.http#login', {
      label: 'login',
      method: 'POST',
      url: 'https://example.com/login',
      uri: 'file:///workspace/a.http'
    });

    const roots = provider.getChildren();
    const pinnedGroup = roots[0] as GroupNode;
    const pinnedRequest = provider.getChildren(pinnedGroup)[0] as RequestNode;
    const fileNode = roots.find((n: NavNode) => n.kind === 'file')!;
    const fileRequest = provider.getChildren(fileNode)[0] as RequestNode;

    const pinnedId = provider.getTreeItem(pinnedRequest).id;
    const fileId = provider.getTreeItem(fileRequest).id;

    expect(pinnedId).toBe('request:pinned:name:file:///workspace/a.http#login');
    expect(fileId).toBe('request:tree:name:file:///workspace/a.http#login');
    expect(pinnedId).not.toBe(fileId);

    index.dispose();
  });
});
