import * as vscode from 'vscode';
import { Method } from '../types';

interface IconSpec {
  codicon: string;
  color: string;
}

function spec(method: Method | undefined): IconSpec {
  switch (method) {
    case 'GET':
      return { codicon: 'arrow-down', color: 'charts.blue' };
    case 'POST':
      return { codicon: 'add', color: 'charts.green' };
    case 'PUT':
      return { codicon: 'edit', color: 'charts.orange' };
    case 'PATCH':
      return { codicon: 'diff', color: 'charts.orange' };
    case 'DELETE':
      return { codicon: 'trash', color: 'charts.red' };
    case 'HEAD':
    case 'OPTIONS':
    case 'TRACE':
      return { codicon: 'info', color: 'descriptionForeground' };
    case 'GRPC':
    case 'WS':
    case 'MQTT':
    case 'GRAPHQL':
    case 'SSE':
    case 'AMQP':
      return { codicon: 'radio-tower', color: 'charts.purple' };
    default:
      return { codicon: 'symbol-method', color: 'descriptionForeground' };
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

/** `$(codicon)` token for inline use in QuickPick item labels. */
export function methodCodicon(method: Method | undefined, disabled: boolean): string {
  return `$(${disabled ? 'circle-slash' : spec(method).codicon})`;
}
