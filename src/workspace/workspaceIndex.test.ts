import * as vscode from 'vscode';
import { __test } from '../test/vscode-mock';
import { WorkspaceIndex } from './workspaceIndex';

const A = '/workspace/a.http';
const B = '/workspace/sub/b.rest';

beforeEach(() => {
  __test.reset();
});

describe('WorkspaceIndex', () => {
  it('1. init populates the map with every parsed file', async () => {
    __test.setFile(A, 'GET https://example.com/a');
    __test.setFile(B, '### login\n# @name login\nPOST https://example.com/login');

    const index = new WorkspaceIndex();
    await index.init();

    expect(index.getAll()).toHaveLength(2);
    expect(index.getByUri(vscode.Uri.file(A))?.regions).toHaveLength(1);
    expect(index.getByUri(vscode.Uri.file(B))?.regions[0]).toMatchObject({
      kind: 'request',
      label: 'login'
    });
    index.dispose();
  });

  it('2. onDidChange fires once per debounce window despite multiple edits', async () => {
    __test.setFile(A, 'GET https://example.com/a');
    const index = new WorkspaceIndex();
    await index.init();

    jest.useFakeTimers();
    const listener = jest.fn();
    index.onDidChange(listener);

    const uri = vscode.Uri.file(A);
    __test.watcher().change.fire(uri);
    __test.watcher().change.fire(uri);
    __test.watcher().change.fire(uri);

    await jest.advanceTimersByTimeAsync(300);

    expect(listener).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
    index.dispose();
  });

  it('3. a delete event removes the file from the map', async () => {
    __test.setFile(A, 'GET https://example.com/a');
    __test.setFile(B, 'GET https://example.com/b');
    const index = new WorkspaceIndex();
    await index.init();
    expect(index.getAll()).toHaveLength(2);

    __test.watcher().delete.fire(vscode.Uri.file(A));

    expect(index.getAll()).toHaveLength(1);
    expect(index.getByUri(vscode.Uri.file(A))).toBeUndefined();
    index.dispose();
  });

  it('4. getAllRequests returns regions from every file', async () => {
    __test.setFile(A, '### one\nGET https://example.com/1\n\n### two\nGET https://example.com/2');
    __test.setFile(B, 'POST https://example.com/3');
    const index = new WorkspaceIndex();
    await index.init();

    const requests = index.getAllRequests();
    expect(requests).toHaveLength(3);
    expect(requests.map((r) => r.region.method).sort()).toEqual(['GET', 'GET', 'POST']);
    index.dispose();
  });
});
