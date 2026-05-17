import type * as vscode from 'vscode';
import { RequestRegion } from '../types';

/**
 * Stable identity key for a request, used to persist pins.
 *
 * If the request carries `# @name`, the key is name-based and survives line
 * shifts within the same file. Otherwise we fall back to a line-number key
 * (best-effort — the pin may become stale if the file is heavily edited).
 */
export function computeKey(region: RequestRegion, uri: vscode.Uri): string {
  if (region.name) {
    return `name:${uri.toString()}#${region.name}`;
  }
  return `line:${uri.toString()}#${region.requestLine}`;
}
