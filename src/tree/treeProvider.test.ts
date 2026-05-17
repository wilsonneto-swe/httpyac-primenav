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

  it('9. same folder name in different parents produces distinct ids', async () => {
    // services/auth/api/login.http and services/pay/api/charge.http
    // Both have a sub-folder named "api" but under different parents.
    __test.setFile('/workspace/services/auth/api/login.http', 'GET https://auth/login');
    __test.setFile('/workspace/services/pay/api/charge.http', 'GET https://pay/charge');
    const { provider, index } = await makeProvider();

    // Root should have one folder "services"
    const roots = provider.getChildren();
    expect(roots[0].kind).toBe('folder');

    // Descend: services → auth + pay
    const servicesNode = roots[0] as NavNode & { kind: 'folder' };
    const serviceChildren = provider.getChildren(servicesNode);
    const authFolder = serviceChildren.find((n) => n.kind === 'folder' && (n as NavNode & { label: string }).label === 'auth')!;
    const payFolder  = serviceChildren.find((n) => n.kind === 'folder' && (n as NavNode & { label: string }).label === 'pay')!;

    // Each has a sub-folder named "api"
    const authApiFolder = provider.getChildren(authFolder)[0];
    const payApiFolder  = provider.getChildren(payFolder)[0];

    expect(authApiFolder.kind).toBe('folder');
    expect(payApiFolder.kind).toBe('folder');

    const authApiId = provider.getTreeItem(authApiFolder).id;
    const payApiId  = provider.getTreeItem(payApiFolder).id;

    expect(authApiId).toBe('folder:services/auth/api');
    expect(payApiId).toBe('folder:services/pay/api');
    expect(authApiId).not.toBe(payApiId);

    index.dispose();
  });

  it('10. same filename in different folders produces distinct file ids', async () => {
    __test.setFile('/workspace/auth/requests.http', 'GET https://auth/me');
    __test.setFile('/workspace/pay/requests.http',  'GET https://pay/me');
    const { provider, index } = await makeProvider();

    const roots = provider.getChildren();
    const authFolder = roots.find((n) => n.kind === 'folder' && (n as NavNode & { label: string }).label === 'auth')!;
    const payFolder  = roots.find((n) => n.kind === 'folder' && (n as NavNode & { label: string }).label === 'pay')!;

    const authFile = provider.getChildren(authFolder)[0];
    const payFile  = provider.getChildren(payFolder)[0];

    const authId = provider.getTreeItem(authFile).id;
    const payId  = provider.getTreeItem(payFile).id;

    expect(authId).toBe('file:file:///workspace/auth/requests.http');
    expect(payId).toBe('file:file:///workspace/pay/requests.http');
    expect(authId).not.toBe(payId);

    index.dispose();
  });

  it('11. requests with same @name in different files produce distinct ids', async () => {
    __test.setFile('/workspace/auth/api.http', '# @name login\nPOST https://auth/login');
    __test.setFile('/workspace/pay/api.http',  '# @name login\nPOST https://pay/login');
    const { provider, index } = await makeProvider();

    const roots = provider.getChildren();
    const authFolder = roots.find((n) => n.kind === 'folder' && (n as NavNode & { label: string }).label === 'auth')!;
    const payFolder  = roots.find((n) => n.kind === 'folder' && (n as NavNode & { label: string }).label === 'pay')!;

    const authReq = provider.getChildren(provider.getChildren(authFolder)[0])[0];
    const payReq  = provider.getChildren(provider.getChildren(payFolder)[0])[0];

    const authId = provider.getTreeItem(authReq).id;
    const payId  = provider.getTreeItem(payReq).id;

    expect(authId).toBe('request:tree:name:file:///workspace/auth/api.http#login');
    expect(payId).toBe('request:tree:name:file:///workspace/pay/api.http#login');
    expect(authId).not.toBe(payId);

    index.dispose();
  });

  it('12. sections with same label in different files have distinct ids', async () => {
    __test.setFile('/workspace/auth/api.http', '#### Auth\n# @name me\nGET https://auth/me');
    __test.setFile('/workspace/pay/api.http',  '#### Auth\n# @name charge\nGET https://pay/charge');
    const { provider, index } = await makeProvider();

    const roots = provider.getChildren();
    const authFolder = roots.find((n) => n.kind === 'folder' && (n as NavNode & { label: string }).label === 'auth')!;
    const payFolder  = roots.find((n) => n.kind === 'folder' && (n as NavNode & { label: string }).label === 'pay')!;

    const authSection = provider.getChildren(provider.getChildren(authFolder)[0])[0];
    const paySection  = provider.getChildren(provider.getChildren(payFolder)[0])[0];

    expect(authSection.kind).toBe('section');
    expect(paySection.kind).toBe('section');

    const authId = provider.getTreeItem(authSection).id;
    const payId  = provider.getTreeItem(paySection).id;

    // Both are "Auth" sections but from different files → different ids
    expect(authId).toBe('section:file:///workspace/auth/api.http#section:0');
    expect(payId).toBe('section:file:///workspace/pay/api.http#section:0');
    expect(authId).not.toBe(payId);

    index.dispose();
  });
});
