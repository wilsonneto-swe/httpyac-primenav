import type * as vscode from 'vscode';
import * as path from 'path';
import { Method, METHODS, ParsedFile, Region } from '../types';

const VERB_RE = new RegExp(`^(${METHODS.join('|')})\\s+(\\S+)`);
const REQUEST_SEP_RE = /^###(\s+.*)?$/;
const SECTION_RE = /^(#{4,})\s+(.+)$/;
const META_NAME_RE = /^#\s*@name\s+(\S+)/;
const META_TITLE_RE = /^#\s*@title\s+(.+)$/;
const META_REF_RE = /^#\s*@(?:ref|forceRef)\s+(\S+)/;
const META_DISABLED_RE = /^#\s*@disabled\b/;
const META_IMPORT_RE = /^#\s*@import\s+(\S+)/;
const META_GROUP_RE = /^#\s*@group\s+(\S+)/;

const META_RE = /^#\s*@\w/;

interface Builder {
  startLine: number;
  /** Text following the `###` separator (empty for an implicit region). */
  sectionText: string;
  name?: string;
  title?: string;
  method?: Method;
  url?: string;
  requestLine?: number;
  disabled: boolean;
  refs: string[];
  group?: string;
  /** Whether a blank line has been seen since the region opened. */
  sawBlank: boolean;
}

/**
 * Parse a single `.http` / `.rest` file into ordered regions.
 *
 * Line-based and lenient — see TDD §7. Pure function, no I/O.
 */
export function parseHttpFile(text: string, uri: vscode.Uri): ParsedFile {
  const lines = text.split(/\r?\n/);
  const regions: Region[] = [];
  const imports: string[] = [];
  const dir = path.dirname(uri.fsPath);

  let builder: Builder | null = null;

  const finalize = (): void => {
    if (!builder) {
      return;
    }
    const b = builder;
    builder = null;

    const hasVerb = b.method !== undefined;
    // A verb-less region survives only when it carries a `# @name`.
    if (!hasVerb && b.name === undefined) {
      return;
    }

    let label = b.name ?? b.sectionText;
    if (!label) {
      label = hasVerb ? `${b.method} ${b.url}` : '(unnamed)';
    }

    regions.push({
      kind: 'request',
      label,
      title: b.title,
      method: b.method,
      url: b.url,
      startLine: b.startLine,
      requestLine: b.requestLine ?? b.startLine,
      disabled: b.disabled,
      refs: b.refs,
      group: b.group
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // `# @import` is file-level metadata — collect it wherever it appears.
    const imp = line.match(META_IMPORT_RE);
    if (imp) {
      const target = imp[1];
      imports.push(path.isAbsolute(target) ? target : path.resolve(dir, target));
    }

    // Section header (`####` or deeper). Does not start a request.
    const section = line.match(SECTION_RE);
    if (section) {
      finalize();
      regions.push({
        kind: 'section',
        level: section[1].length - 1,
        label: section[2].trim(),
        startLine: i
      });
      continue;
    }

    // Request separator.
    const sep = line.match(REQUEST_SEP_RE);
    if (sep) {
      finalize();
      builder = {
        startLine: i,
        sectionText: (sep[1] ?? '').trim(),
        disabled: false,
        refs: [],
        sawBlank: false
      };
      continue;
    }

    // Blank line — marks the boundary between headers and body.
    if (line === '') {
      if (builder) {
        builder.sawBlank = true;
      }
      continue;
    }

    // HTTP verb line.
    const verb = line.match(VERB_RE);
    if (verb) {
      if (!builder) {
        // Implicit region — the file begins straight with a verb (TDD §7).
        builder = {
          startLine: regions.length === 0 ? 0 : i,
          sectionText: '',
          disabled: false,
          refs: [],
          sawBlank: false
        };
      }
      if (!builder.sawBlank && builder.method === undefined) {
        builder.method = verb[1] as Method;
        builder.url = verb[2];
        builder.requestLine = i;
      }
      continue;
    }

    // Region metadata — only meaningful before the verb and before the
    // first blank line. Leading metadata with no `###` opens an implicit
    // region so the request keeps its `# @name` / `# @title`.
    if (META_RE.test(line)) {
      if (!builder && regions.length === 0) {
        builder = {
          startLine: 0,
          sectionText: '',
          disabled: false,
          refs: [],
          sawBlank: false
        };
      }
      if (builder && !builder.sawBlank && builder.method === undefined) {
        applyMeta(builder, line);
      }
    }
  }

  finalize();
  return { uri, regions, imports };
}

function applyMeta(builder: Builder, line: string): void {
  let m: RegExpMatchArray | null;
  if ((m = line.match(META_NAME_RE))) {
    builder.name = m[1];
  } else if ((m = line.match(META_TITLE_RE))) {
    builder.title = m[1].trim();
  } else if ((m = line.match(META_REF_RE))) {
    builder.refs.push(m[1]);
  } else if (META_DISABLED_RE.test(line)) {
    builder.disabled = true;
  } else if ((m = line.match(META_GROUP_RE))) {
    builder.group = m[1];
  }
}
