/**
 * Minimal CSV/TSV parser for MLS exports (v1.47 Lane C comp-import).
 *
 * Why hand-rolled (no papaparse dep): MLS exports follow the standard
 * delimiter-separated format with quoted fields. The interesting cases
 * are well-defined:
 *   - Auto-detect tab vs comma (NWMLS Matrix "Full" is TSV; some other
 *     systems export as CSV).
 *   - Quoted fields may contain the delimiter, embedded newlines, and
 *     escaped quotes (`""` inside a quoted field = a literal `"`).
 *   - Trailing CR is stripped (Windows line endings).
 *
 * What this does NOT handle (and doesn't need to):
 *   - Streaming. The entire file fits in memory; the route caps at 5 MB.
 *   - Multi-character delimiters. CSV / TSV are single-char.
 *   - Quote characters other than `"`.
 *   - BOM stripping — checked at the top of `parse()`.
 *
 * The parser is the only place that touches raw bytes from the upload.
 * Everything downstream works on `string[][]` (rows of cells).
 */

export type Delimiter = ',' | '\t';

export interface ParseResult {
  delimiter: Delimiter;
  header: string[];
  rows: string[][];
}

/**
 * Detect delimiter by counting candidates in the first line. Ties or
 * zero-counts → throws (the caller surfaces the calm "I couldn't
 * recognize the file format" copy).
 */
export function detectDelimiter(firstLine: string): Delimiter {
  const tabs = countOutsideQuotes(firstLine, '\t');
  const commas = countOutsideQuotes(firstLine, ',');
  if (tabs === 0 && commas === 0) {
    throw new Error('no-delimiter');
  }
  return tabs >= commas ? '\t' : ',';
}

function countOutsideQuotes(line: string, ch: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      // Escaped quote inside a quoted field is `""` — treat as data.
      if (inQuotes && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ch) count += 1;
  }
  return count;
}

/**
 * Parse a full file. Returns the detected delimiter, the header row,
 * and the data rows. Empty trailing lines are skipped. Strips a UTF-8
 * BOM if present.
 */
export function parse(raw: string): ParseResult {
  // Strip BOM. Some Windows-exported MLS files lead with U+FEFF.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

  // Detect delimiter from the FIRST LOGICAL line (i.e. the first line
  // not inside a quoted field). For typical MLS headers, the first \n
  // is the end of line 1.
  const firstLineEnd = findFirstLineEnd(text);
  const firstLine = text.slice(0, firstLineEnd);
  const delimiter = detectDelimiter(firstLine);

  const allRows = parseRows(text, delimiter);
  if (allRows.length === 0) {
    return { delimiter, header: [], rows: [] };
  }
  const [header, ...rows] = allRows;
  return { delimiter, header, rows };
}

/**
 * Find the index of the first newline that is NOT inside a quoted
 * field. Returns the file length if no newline exists.
 */
function findFirstLineEnd(text: string): number {
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (c === '\n' || c === '\r')) return i;
  }
  return text.length;
}

/**
 * Tokenize the whole file into rows of cells. Honors quoted fields,
 * escaped quotes (`""` → `"`), and CRLF line endings.
 */
function parseRows(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote: keep one literal " and consume the second.
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (c === '\r') {
      // CRLF — peek + consume the LF together below.
      continue;
    }
    if (c === '\n') {
      row.push(cell);
      cell = '';
      // Skip empty rows (e.g. trailing newline at EOF).
      if (row.length === 1 && row[0] === '') {
        row = [];
        continue;
      }
      rows.push(row);
      row = [];
      continue;
    }
    cell += c;
  }

  // Flush any final unterminated row (file without trailing newline).
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
  }

  return rows;
}
