import type * as vscode from 'vscode';

export type Method =
  | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  | 'HEAD' | 'OPTIONS' | 'TRACE'
  // httpYac extra protocols
  | 'GRPC' | 'GRAPHQL' | 'WS' | 'MQTT' | 'SSE' | 'AMQP';

export const METHODS: Method[] = [
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE',
  'HEAD', 'OPTIONS', 'TRACE',
  'GRPC', 'GRAPHQL', 'WS', 'MQTT', 'SSE', 'AMQP'
];

export interface RequestRegion {
  kind: 'request';
  /** From `# @name foo` if present, else from `### label`, else from URL. */
  label: string;
  /** The raw `# @name` value, if the request was explicitly named. */
  name?: string;
  /** Optional. `# @title` overrides label for display only. */
  title?: string;
  method?: Method;
  url?: string;
  /** Line where the `###` separator (or file start) sits. 0-indexed. */
  startLine: number;
  /** Line where the HTTP verb appears, used for "reveal" placement. */
  requestLine: number;
  disabled: boolean;
  /** `# @ref name` or `# @forceRef name` */
  refs: string[];
  /** Tag from a custom comment, e.g. `# @group auth`. Optional, used for grouping later. */
  group?: string;
}

export interface SectionRegion {
  kind: 'section';
  /** Header level — number of `#` minus 1. `####` = level 3. */
  level: number;
  label: string;
  startLine: number;
}

export type Region = RequestRegion | SectionRegion;

export interface ParsedFile {
  uri: vscode.Uri;
  regions: Region[];
  /** `# @import ./other.http` paths, resolved relative to this file. */
  imports: string[];
}

/** Display label for a request, applying the fallback order from the TDD. */
export function displayLabel(region: RequestRegion): string {
  if (region.title) {
    return region.title;
  }
  return region.label;
}
