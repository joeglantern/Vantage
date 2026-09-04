/**
 * A small CSV reader for the test fixtures.
 *
 * This is not the import parser. The real one has to survive whatever a
 * programme officer's spreadsheet export produces, and it will want a proper
 * library. This handles quoted fields and nothing else, which is all the
 * fixtures need, and it keeps the fixture tests free of a dependency decision
 * that docs/02 has not made yet.
 */

export type CsvRow = Readonly<Record<string, string>>;

/** Excel writes one of these. Strip it or the first header name never matches. */
const BYTE_ORDER_MARK = '﻿';

/** Parses CSV text into rows keyed by the header line. */
export function parseCsv(text: string): CsvRow[] {
  const body = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
  const records = splitRecords(body);
  const header = records.shift();
  if (header === undefined) return [];

  return records
    .filter((fields) => fields.some((field) => field.trim() !== ''))
    .map((fields) => {
      const row: Record<string, string> = {};
      header.forEach((name, index) => {
        row[name.trim()] = fields[index] ?? '';
      });
      return row;
    });
}

/** Splits into records, respecting quotes so a comma inside "1,500" survives. */
function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    switch (char) {
      case '"':
        quoted = true;
        break;
      case ',':
        fields.push(field);
        field = '';
        break;
      case '\r':
        break;
      case '\n':
        fields.push(field);
        records.push(fields);
        fields = [];
        field = '';
        break;
      default:
        field += char ?? '';
    }
  }

  if (field !== '' || fields.length > 0) {
    fields.push(field);
    records.push(fields);
  }

  return records;
}
