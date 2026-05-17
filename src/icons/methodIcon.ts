import * as vscode from 'vscode';
import { Method } from '../types';

interface IconSpec {
  codicon: string;
  color: string;
  badge: string;
}

function spec(method: Method | undefined): IconSpec {
  switch (method) {
    case 'GET':
      return { codicon: 'arrow-down', color: 'charts.blue', badge: 'get' };
    case 'POST':
      return { codicon: 'add', color: 'charts.green', badge: 'post' };
    case 'PUT':
      return { codicon: 'edit', color: 'charts.orange', badge: 'put' };
    case 'PATCH':
      return { codicon: 'diff', color: 'charts.orange', badge: 'patch' };
    case 'DELETE':
      return { codicon: 'trash', color: 'charts.red', badge: 'delete' };
    case 'HEAD':
    case 'OPTIONS':
    case 'TRACE':
      return { codicon: 'info', color: 'descriptionForeground', badge: 'other' };
    case 'GRPC':
    case 'WS':
    case 'MQTT':
    case 'GRAPHQL':
    case 'SSE':
    case 'AMQP':
      return { codicon: 'radio-tower', color: 'charts.purple', badge: 'other' };
    default:
      return { codicon: 'symbol-method', color: 'descriptionForeground', badge: 'other' };
  }
}

/** ThemeIcon for a request node, dimmed when the request is disabled. */
export function methodIcon(method: Method | undefined, disabled: boolean): vscode.ThemeIcon {
  if (disabled) {
    return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
  }
  const { codicon, color } = spec(method);
  return new vscode.ThemeIcon(codicon, new vscode.ThemeColor(color));
}

/** SVG badge icon for a request node in the tree view. */
export function methodBadgeIcon(
  method: Method | undefined,
  disabled: boolean,
  extensionUri: vscode.Uri
): vscode.Uri {
  const fileName = `${disabled ? 'disabled' : spec(method).badge}.svg`;
  return vscode.Uri.joinPath(extensionUri, 'images', 'methods', fileName);
}

/** `$(codicon)` token for inline use in QuickPick item labels. */
export function methodCodicon(method: Method | undefined, disabled: boolean): string {
  return `$(${disabled ? 'circle-slash' : spec(method).codicon})`;
}
