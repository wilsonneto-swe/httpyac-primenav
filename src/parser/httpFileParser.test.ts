import * as vscode from 'vscode';
import { parseHttpFile } from './httpFileParser';
import { RequestRegion, SectionRegion, displayLabel } from '../types';

const uri = vscode.Uri.file('/workspace/requests.http');

const requests = (text: string): RequestRegion[] =>
  parseHttpFile(text, uri).regions.filter(
    (r): r is RequestRegion => r.kind === 'request'
  );

const sections = (text: string): SectionRegion[] =>
  parseHttpFile(text, uri).regions.filter(
    (r): r is SectionRegion => r.kind === 'section'
  );

describe('parseHttpFile', () => {
  it('1. parses a single anonymous GET with no ###', () => {
    const reqs = requests('GET https://example.com/health');
    expect(reqs).toHaveLength(1);
    expect(reqs[0].method).toBe('GET');
    expect(reqs[0].url).toBe('https://example.com/health');
    expect(reqs[0].label).toBe('GET https://example.com/health');
    expect(reqs[0].startLine).toBe(0);
    expect(reqs[0].requestLine).toBe(0);
  });

  it('2. parses two requests separated by ###, second named via @name', () => {
    const text = [
      '### first',
      'GET https://example.com/one',
      '',
      '### login',
      '# @name login',
      'POST https://example.com/login'
    ].join('\n');
    const reqs = requests(text);
    expect(reqs).toHaveLength(2);
    expect(reqs[0].label).toBe('first');
    expect(reqs[1].label).toBe('login');
    expect(reqs[1].method).toBe('POST');
    expect(reqs[1].requestLine).toBe(5);
  });

  it('3. uses @title for the display label', () => {
    const text = ['### raw', '# @title Friendly Title', 'GET https://example.com'].join(
      '\n'
    );
    const reqs = requests(text);
    expect(reqs[0].title).toBe('Friendly Title');
    expect(displayLabel(reqs[0])).toBe('Friendly Title');
  });

  it('4. marks a request disabled via @disabled', () => {
    const text = ['### off', '# @disabled', 'GET https://example.com'].join('\n');
    expect(requests(text)[0].disabled).toBe(true);
  });

  it('5. collects @ref and @forceRef into refs', () => {
    const text = [
      '### chained',
      '# @ref a',
      '# @forceRef b',
      'GET https://example.com'
    ].join('\n');
    expect(requests(text)[0].refs).toEqual(['a', 'b']);
  });

  it('6. records @import paths on the ParsedFile', () => {
    const text = ['# @import ./other.http', '', '### x', 'GET https://example.com'].join(
      '\n'
    );
    const parsed = parseHttpFile(text, uri);
    expect(parsed.imports).toEqual(['/workspace/other.http']);
  });

  it('7. detects #### and ##### sections with levels 3 and 4', () => {
    const text = [
      '#### Section',
      '### a',
      'GET https://example.com/a',
      '##### Sub',
      '### b',
      'GET https://example.com/b'
    ].join('\n');
    const secs = sections(text);
    expect(secs).toHaveLength(2);
    expect(secs[0]).toMatchObject({ label: 'Section', level: 3 });
    expect(secs[1]).toMatchObject({ label: 'Sub', level: 4 });
  });

  it('8. keeps a verb-less region with @name, drops one without', () => {
    const text = ['### named', '# @name onlyName', '', '### empty'].join('\n');
    const reqs = requests(text);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].label).toBe('onlyName');
    expect(reqs[0].method).toBeUndefined();
    expect(reqs[0].requestLine).toBe(0);
  });

  it('9. ignores @name comments that appear in the body after a blank line', () => {
    const text = [
      '### req',
      'GET https://example.com/a',
      'Content-Type: application/json',
      '',
      '# @name ignored',
      '{}'
    ].join('\n');
    const reqs = requests(text);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].label).toBe('req');
  });

  it('10. recognizes GraphQL, GRPC and WS verbs', () => {
    const text = [
      '### gql',
      'GRAPHQL https://example.com/graphql',
      '',
      '### grpc',
      'GRPC localhost:50051/Greeter/SayHello',
      '',
      '### ws',
      'WS wss://example.com/socket'
    ].join('\n');
    const reqs = requests(text);
    expect(reqs.map((r) => r.method)).toEqual(['GRAPHQL', 'GRPC', 'WS']);
  });

  it('keeps verb lines that follow headers but precede the body blank line', () => {
    const text = ['### h', 'POST https://example.com', 'X-Token: abc', '', 'body'].join(
      '\n'
    );
    expect(requests(text)[0].method).toBe('POST');
  });

  it('falls back to (unnamed) for a verb-less @group-only region', () => {
    const text = ['### g', '# @name g1', '# @group auth', 'GET https://example.com'].join(
      '\n'
    );
    expect(requests(text)[0].group).toBe('auth');
  });
});
