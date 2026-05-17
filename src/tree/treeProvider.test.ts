import * as vscodeMock from '../test/vscode-mock';
import { __test, FakeMemento } from '../test/vscode-mock';
import { WorkspaceIndex } from '../workspace/workspaceIndex';
import { RequestsTreeProvider, CurrentFileTreeProvider } from './treeProvider';
import { FavoritesStore } from '../state/favoritesStore';
import { NavNode, GroupNode, RequestNode, SectionNode } from './treeItems';

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

  it('13. expandable nodes start collapsed', async () => {
    __test.setFile('/workspace/services/auth/api.http', '#### Auth\n# @name login\nPOST https://auth/login');
    const { provider, index, store } = await makeProvider();

    store.togglePin('name:file:///workspace/services/auth/api.http#login', {
      label: 'login',
      method: 'POST',
      url: 'https://auth/login',
      uri: 'file:///workspace/services/auth/api.http'
    });

    const roots = provider.getChildren();
    const group = roots.find((n) => n.kind === 'group')!;
    const servicesFolder = roots.find((n) => n.kind === 'folder')!;
    const authFolder = provider.getChildren(servicesFolder)[0];
    const fileNode = provider.getChildren(authFolder)[0];
    const sectionNode = provider.getChildren(fileNode)[0];

    expect(provider.getTreeItem(group).collapsibleState).toBe(vscodeMock.TreeItemCollapsibleState.Collapsed);
    expect(provider.getTreeItem(servicesFolder).collapsibleState).toBe(vscodeMock.TreeItemCollapsibleState.Collapsed);
    expect(provider.getTreeItem(authFolder).collapsibleState).toBe(vscodeMock.TreeItemCollapsibleState.Collapsed);
    expect(provider.getTreeItem(fileNode).collapsibleState).toBe(vscodeMock.TreeItemCollapsibleState.Collapsed);
    expect(provider.getTreeItem(sectionNode).collapsibleState).toBe(vscodeMock.TreeItemCollapsibleState.Collapsed);

    index.dispose();
  });

  it('14. finds a nested file node by uri for reveal', async () => {
    __test.setFile('/workspace/services/auth/api.http', 'GET https://auth/me');
    const { provider, index } = await makeProvider();

    const uri = vscodeMock.Uri.file('/workspace/services/auth/api.http') as unknown as import('vscode').Uri;
    const node = provider.findFileNode(uri);

    expect(node?.kind).toBe('file');
    expect(node?.label).toBe('api.http');

    index.dispose();
  });
});

describe('CurrentFileTreeProvider', () => {
  beforeEach(() => __test.reset());

  async function makeCurrentFileProvider(storeMemento = new FakeMemento()) {
    const index = new WorkspaceIndex();
    await index.init();
    const store = new FavoritesStore(storeMemento);
    const provider = new CurrentFileTreeProvider(index, store);
    return { index, store, provider };
  }

  it('15. returns empty when no active file is set', async () => {
    __test.setFile('/workspace/a.http', 'GET https://example.com/health');
    const { provider, index } = await makeCurrentFileProvider();

    expect(provider.getChildren()).toHaveLength(0);

    index.dispose();
  });

  it('16. returns sections and requests for the active file', async () => {
    __test.setFile('/workspace/a.http', '#### Auth\n# @name login\nPOST https://auth/login\n###\nGET https://auth/me');
    const { provider, index } = await makeCurrentFileProvider();

    const uri = vscodeMock.Uri.file('/workspace/a.http') as unknown as import('vscode').Uri;
    provider.setActiveFile(uri);

    const roots = provider.getChildren();
    // groupBySections is true by default → first child is a section
    expect(roots.length).toBeGreaterThan(0);
    expect(roots[0].kind).toBe('section');

    index.dispose();
  });

  it('17. sections are expanded (collapsibleState = Expanded) in current file view', async () => {
    __test.setFile('/workspace/a.http', '#### Auth\n# @name login\nPOST https://auth/login');
    const { provider, index } = await makeCurrentFileProvider();

    const uri = vscodeMock.Uri.file('/workspace/a.http') as unknown as import('vscode').Uri;
    provider.setActiveFile(uri);

    const roots = provider.getChildren();
    const section = roots[0] as SectionNode;
    expect(provider.getTreeItem(section).collapsibleState).toBe(vscodeMock.TreeItemCollapsibleState.Expanded);

    index.dispose();
  });

  it('18. returns empty when active file uri is not in the index', async () => {
    __test.setFile('/workspace/a.http', 'GET https://example.com/health');
    const { provider, index } = await makeCurrentFileProvider();

    const uri = vscodeMock.Uri.file('/workspace/unknown.http') as unknown as import('vscode').Uri;
    provider.setActiveFile(uri);

    expect(provider.getChildren()).toHaveLength(0);

    index.dispose();
  });

  it('19. updates when setActiveFile is called with a different uri', async () => {
    __test.setFile('/workspace/a.http', 'GET https://a.com');
    __test.setFile('/workspace/b.http', 'POST https://b.com');
    const { provider, index } = await makeCurrentFileProvider();

    const uriA = vscodeMock.Uri.file('/workspace/a.http') as unknown as import('vscode').Uri;
    const uriB = vscodeMock.Uri.file('/workspace/b.http') as unknown as import('vscode').Uri;

    provider.setActiveFile(uriA);
    const reqA = provider.getChildren()[0] as RequestNode;
    expect(reqA.region.url).toBe('https://a.com');

    provider.setActiveFile(uriB);
    const reqB = provider.getChildren()[0] as RequestNode;
    expect(reqB.region.url).toBe('https://b.com');

    index.dispose();
  });

  it('20. returns empty after setActiveFile(undefined)', async () => {
    __test.setFile('/workspace/a.http', 'GET https://example.com');
    const { provider, index } = await makeCurrentFileProvider();

    const uri = vscodeMock.Uri.file('/workspace/a.http') as unknown as import('vscode').Uri;
    provider.setActiveFile(uri);
    expect(provider.getChildren().length).toBeGreaterThan(0);

    provider.setActiveFile(undefined);
    expect(provider.getChildren()).toHaveLength(0);

    index.dispose();
  });
});
