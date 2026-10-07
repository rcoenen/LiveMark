/**
 * An order-preserving JSON model. Comment metadata is untrusted and may carry extension fields,
 * so objects keep their entries (and numbers their source text) instead of becoming plain JS values.
 */
export type JsonValue = JsonNull | JsonBool | JsonNumber | JsonString | JsonArray | JsonObject;
export interface JsonNull { t: 'null' }
export interface JsonBool { t: 'bool'; v: boolean }
export interface JsonNumber { t: 'num'; raw: string }
export interface JsonString { t: 'str'; v: string }
export interface JsonArray { t: 'arr'; items: JsonValue[] }
export interface JsonObject { t: 'obj'; entries: Array<[string, JsonValue]> }

export class JsonError extends Error {}

const MAX_DEPTH = 64;

/** Strict RFC 8259 parsing that also rejects duplicate keys and numbers outside the finite range. */
export function parseJson(text: string): JsonValue {
  let i = 0;
  const fail = (message: string): never => {
    throw new JsonError(`${message} at position ${i}`);
  };
  const ws = (): void => {
    while (i < text.length && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++;
  };
  const literal = (word: string): void => {
    if (text.startsWith(word, i)) i += word.length;
    else fail('Unexpected token');
  };
  const string = (): string => {
    i++;
    let out = '';
    for (;;) {
      if (i >= text.length) fail('Unterminated string');
      const c = text[i];
      if (c === '"') {
        i++;
        return out;
      }
      if (c === '\\') {
        const e = text[i + 1];
        i += 2;
        if (e === 'u') {
          const hex = text.substring(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid unicode escape');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
          if (!(e in map)) fail('Invalid escape');
          out += map[e];
        }
        continue;
      }
      if (c.charCodeAt(0) < 0x20) fail('Control character in string');
      out += c;
      i++;
    }
  };
  const number = (): JsonNumber => {
    const match = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.substring(i));
    if (!match) fail('Invalid number');
    const raw = (match as RegExpExecArray)[0];
    if (!Number.isFinite(Number(raw))) fail('Number out of range');
    i += raw.length;
    return { t: 'num', raw };
  };
  const value = (depth: number): JsonValue => {
    if (depth > MAX_DEPTH) fail('Nesting too deep');
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const entries: Array<[string, JsonValue]> = [];
      const seen = new Set<string>();
      ws();
      if (text[i] === '}') {
        i++;
        return { t: 'obj', entries };
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail('Expected a key');
        const key = string();
        if (seen.has(key)) fail(`Duplicate key "${key}"`);
        seen.add(key);
        ws();
        if (text[i] !== ':') fail('Expected ":"');
        i++;
        entries.push([key, value(depth + 1)]);
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') {
          i++;
          return { t: 'obj', entries };
        }
        fail('Expected "," or "}"');
      }
    }
    if (c === '[') {
      i++;
      const items: JsonValue[] = [];
      ws();
      if (text[i] === ']') {
        i++;
        return { t: 'arr', items };
      }
      for (;;) {
        items.push(value(depth + 1));
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') {
          i++;
          return { t: 'arr', items };
        }
        fail('Expected "," or "]"');
      }
    }
    if (c === '"') return { t: 'str', v: string() };
    if (c === 't') {
      literal('true');
      return { t: 'bool', v: true };
    }
    if (c === 'f') {
      literal('false');
      return { t: 'bool', v: false };
    }
    if (c === 'n') {
      literal('null');
      return { t: 'null' };
    }
    return number();
  };
  const result = value(0);
  ws();
  if (i !== text.length) fail('Unexpected trailing content');
  return result;
}

/** Pretty-prints with two-space indentation, the shape `JSON.stringify(value, null, 2)` produces. */
export function stringifyJson(value: JsonValue, indent = ''): string {
  switch (value.t) {
    case 'null':
      return 'null';
    case 'bool':
      return value.v ? 'true' : 'false';
    case 'num':
      return value.raw;
    case 'str':
      return JSON.stringify(value.v);
    case 'arr': {
      if (value.items.length === 0) return '[]';
      const inner = indent + '  ';
      return `[\n${value.items.map((item) => inner + stringifyJson(item, inner)).join(',\n')}\n${indent}]`;
    }
    case 'obj': {
      if (value.entries.length === 0) return '{}';
      const inner = indent + '  ';
      return `{\n${value.entries.map(([key, item]) => `${inner}${JSON.stringify(key)}: ${stringifyJson(item, inner)}`).join(',\n')}\n${indent}}`;
    }
  }
}

export const jstr = (v: string): JsonString => ({ t: 'str', v });
export const jnum = (n: number): JsonNumber => ({ t: 'num', raw: String(n) });
export const jnull: JsonNull = { t: 'null' };
export const jobj = (entries: Array<[string, JsonValue]>): JsonObject => ({ t: 'obj', entries });
export const jarr = (items: JsonValue[]): JsonArray => ({ t: 'arr', items });

export function get(obj: JsonObject, key: string): JsonValue | undefined {
  return obj.entries.find(([name]) => name === key)?.[1];
}

/** Replaces a value in place, so existing key order survives; new keys go last. */
export function set(obj: JsonObject, key: string, value: JsonValue): void {
  const entry = obj.entries.find(([name]) => name === key);
  if (entry) entry[1] = value;
  else obj.entries.push([key, value]);
}

export function remove(obj: JsonObject, key: string): void {
  obj.entries = obj.entries.filter(([name]) => name !== key);
}

export function getString(obj: JsonObject, key: string): string | undefined {
  const value = get(obj, key);
  return value?.t === 'str' ? value.v : undefined;
}

export function clone<T extends JsonValue>(value: T): T {
  switch (value.t) {
    case 'arr':
      return { t: 'arr', items: value.items.map(clone) } as T;
    case 'obj':
      return { t: 'obj', entries: value.entries.map(([key, item]) => [key, clone(item)]) } as T;
    default:
      return { ...value };
  }
}
