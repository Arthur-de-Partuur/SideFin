// Small helpers to read pieces of OrcaSlicer's C++ source as text.
// This is not a C++ parser: it handles the regular patterns used in
// PrintConfig.cpp and Tab.cpp, and reports what it cannot read.

/** Remove // and /* *\/ comments, keeping string and char literals intact. */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < n && src[j] !== q) {
        if (src[j] === '\\') j++;
        if (src[j] === '\n') break; // unterminated, bail out on this line
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
    } else if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      const chunk = src.slice(i, end < 0 ? n : end + 2);
      out += chunk.replace(/[^\n]/g, ''); // keep line numbers
      i = end < 0 ? n : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Decode a C++ string literal body (without the quotes). */
export function unescapeCpp(s: string): string {
  return s.replace(/\\(n|t|r|"|'|\\|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4})/g, (_, e: string) => {
    switch (e[0]) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'x': return String.fromCharCode(parseInt(e.slice(1), 16));
      case 'u': return String.fromCharCode(parseInt(e.slice(1), 16));
      default: return e;
    }
  });
}

/**
 * Read a string expression such as  L("a" "b")  or  "mm"  or  _L("x").
 * Returns undefined when the expression is not made of string literals.
 */
export function readStringExpr(expr: string): string | undefined {
  let e = expr.trim();
  const wrap = e.match(/^(?:_?L|_u8L|u8|_CTX)\s*\(([\s\S]*)\)$/);
  if (wrap) e = wrap[1].trim();
  // _CTX("text", "context") / L_CONTEXT: keep only the first argument
  const parts = splitTopLevel(e, ',');
  e = parts[0].trim();
  const lits = [...e.matchAll(/"((?:[^"\\]|\\.)*)"/g)];
  if (lits.length === 0) return undefined;
  const rest = e.replace(/"((?:[^"\\]|\\.)*)"/g, '').trim();
  if (rest !== '' && rest !== 'u8' && rest !== 'R') return undefined;
  return lits.map((m) => unescapeCpp(m[1])).join('');
}

/** Split on a separator at nesting depth 0, ignoring separators inside literals. */
export function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length && s[j] !== c) {
        if (s[j] === '\\') j++;
        j++;
      }
      cur += s.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === '(' || c === '{' || c === '[' || c === '<') depth++;
    else if (c === ')' || c === '}' || c === ']' || c === '>') depth = Math.max(0, depth - 1);
    if (c === sep && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** From position of an opening bracket, return the content up to its matching close. */
export function balanced(s: string, openIdx: number): { inner: string; end: number } | undefined {
  const open = s[openIdx];
  const close = open === '(' ? ')' : open === '{' ? '}' : open === '[' ? ']' : '';
  if (!close) return undefined;
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length && s[j] !== c) {
        if (s[j] === '\\') j++;
        j++;
      }
      i = j;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth === 0) return { inner: s.slice(openIdx + 1, i), end: i };
    }
  }
  return undefined;
}

/** Parse a C++ numeric literal (0.4f, 1., -5, 1e-3, true/false). */
export function readNumber(tok: string): number | undefined {
  const t = tok.trim().replace(/^\((.*)\)$/, '$1').trim();
  if (t === 'true') return 1;
  if (t === 'false') return 0;
  const m = t.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)[fFlLuU]*$/);
  if (!m) return undefined;
  return Number(m[1]);
}

/** Format a number the way Orca writes it in profile JSON (shortest form). */
export function fmtNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  // Avoid float noise such as 0.30000000000000004
  return String(Number(n.toPrecision(12)));
}
