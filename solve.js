// A scanner for make.fun's csv-reader 1.0.0 reading policy.
// The reference appends one character at a time; this one jumps to the next
// character that can change the state with a regex search over the whole text,
// then takes the span between jumps with slice. Every error is recorded at the
// same point and in the same order as the reference.

const UNQUOTED = /[,\n\r]/g;
const QUOTED = /["\r\n]/g;

/** The reading of one {text, header} input: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;

  // Field ends: 0 comma, 1 line break, 3 end of text.
  function readUnquoted(value) {
    let added = 0;
    UNQUOTED.lastIndex = pos;
    while (true) {
      const match = UNQUOTED.exec(text);
      const at = match === null ? len : match.index;
      if (at > pos) {
        const span = text.slice(pos, at);
        value += span;
        added += span.length;
      }
      if (match === null) {
        pos = len;
        return { value, ended: 3, added };
      }
      const c = match[0];
      if (c === ',') {
        pos = at + 1;
        return { value, ended: 0, added };
      }
      if (c === '\n') {
        pos = at + 1;
        line += 1;
        return { value, ended: 1, added };
      }
      if (text.charCodeAt(at + 1) === 10) {
        pos = at + 2;
        line += 1;
        return { value, ended: 1, added };
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = at + 1;
      UNQUOTED.lastIndex = pos;
    }
  }

  function readQuoted() {
    const open = pos;
    const openLine = line;
    const pieces = [];
    let closed = false;
    pos += 1;
    QUOTED.lastIndex = pos;
    while (true) {
      const match = QUOTED.exec(text);
      if (match === null) break;
      const at = match.index;
      const c = match[0];
      if (c === '"') {
        if (text.charCodeAt(at + 1) === 34) {
          pieces.push(text.slice(pos, at) + '"');
          pos = at + 2;
          QUOTED.lastIndex = pos;
          continue;
        }
        pieces.push(text.slice(pos, at));
        pos = at + 1;
        closed = true;
        break;
      }
      pieces.push(text.slice(pos, at) + '\n');
      line += 1;
      pos = c === '\r' && text.charCodeAt(at + 1) === 10 ? at + 2 : at + 1;
      QUOTED.lastIndex = pos;
    }
    if (!closed) {
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      pos = open + 1;
      line = openLine;
      return readUnquoted('"');
    }
    const value = pieces.join('');
    if (pos >= len) return { value, ended: 3, added: 0 };
    const code = text.charCodeAt(pos);
    if (code === 44) {
      pos += 1;
      return { value, ended: 0, added: 0 };
    }
    if (code === 10) {
      pos += 1;
      line += 1;
      return { value, ended: 1, added: 0 };
    }
    if (code === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: 1, added: 0 };
    }
    const junk = readUnquoted(value);
    if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  while (true) {
    // A line holding no characters is no record.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted;
    let field;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === 0);

    // A line of only stray CRs held no characters: no record, though its errors stay.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
