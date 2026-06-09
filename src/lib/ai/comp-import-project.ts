import type {
  CompFieldName,
  CompSource,
  ConfidenceLevel,
} from '@/tools/seller-intelligence-report/engine/types';
import type { ColumnMapping } from './comp-import-mapper';

/**
 * Project parsed MLS export rows into Comp candidates using the AI's
 * column mapping (v1.47 Lane C). Pure function — the route calls this
 * per row AFTER getting the mapping back from the model. The model
 * NEVER sees individual rows beyond the first 3 sample rows it scored
 * the mapping on; this projector is the privacy + cost discipline pair.
 *
 * Defensive parsing per Appendix B.4 quirks:
 *   #1  Address split across 8 columns → assemble with proper separators
 *   #2  Bathrooms is a decimal (0.25 increments) → parse as number
 *   #4  Selling Date format M/D/YYYY HH:MM:SS AM/PM → ISO yyyy-MM-dd
 *   #5  Square Footage IS the headline number → use the model's pick
 *   #8  APN may be hyphenated → never numeric-parse
 *   #9  Lot SqFt may be 0 for condos → don't crash
 *   #11 Commission has %% typos → strip non-numeric (only matters for
 *       fields where we care about the numeric value)
 *
 * Each projected Comp gets:
 *   - source: 'imported from MLS export'
 *   - fieldConfidence: the AI's per-field confidence, downgraded if a
 *     row's actual value is missing or unparseable for a given field.
 *
 * Returns { comp, mappingNotes } so the route can surface "we read
 * 'Selling Price' as Sold Price" on the review screen.
 */

export interface ImportedComp {
  address: string;
  soldPrice: string;
  soldDate?: string;
  squareFeet?: string;
  yearBuilt?: number;
  /** FR-2 — feeds the §05 area-snapshot "Days on market" cell. */
  daysOnMarket?: string;
  /** FR-2 — sale-to-list %, computed from list_price ÷ sold_price (we store
   *  only the ratio on the Comp shape, never the raw list price). */
  saleToListPercent?: string;
  /** Display-only on the review screen; not persisted to the Comp shape (no bedrooms field on the substrate Comp). */
  bedrooms?: string;
  /** Display-only on the review screen; not persisted to the Comp shape. */
  bathrooms?: string;
  /** `'imported'` matches the existing CompSource union value (substrate §2.5 names it "imported from MLS export"; the existing TS uses the shorter form). */
  source: CompSource;
  fieldConfidence?: Partial<Record<CompFieldName, ConfidenceLevel>>;
}

/**
 * Caller-facing meta about how each schema field was mapped. Drives
 * the review screen's "we read X as Y" hint line.
 */
export interface MappingNote {
  schemaField: string;
  sourceColumn: string | null;
  confidence: number;
}

export interface ProjectionResult {
  comps: ImportedComp[];
  mappingNotes: MappingNote[];
  /** Rows the projector skipped (e.g. address fully empty). Surfaced in the route response. */
  skippedRowCount: number;
}

export function projectCompRows(
  header: string[],
  rows: string[][],
  mapping: ColumnMapping,
): ProjectionResult {
  const indexByName = new Map<string, number>();
  header.forEach((name, i) => indexByName.set(name, i));

  const comps: ImportedComp[] = [];
  let skippedRowCount = 0;

  for (const row of rows) {
    const projected = projectOneRow(row, indexByName, mapping);
    if (projected) comps.push(projected);
    else skippedRowCount += 1;
  }

  return {
    comps,
    mappingNotes: buildMappingNotes(mapping),
    skippedRowCount,
  };
}

function projectOneRow(
  row: string[],
  indexByName: Map<string, number>,
  mapping: ColumnMapping,
): ImportedComp | null {
  const address = assembleAddress(row, indexByName, mapping.address_components);
  if (!address) return null; // Row with no usable address — skip.

  const soldPriceRaw = readByMapping(row, indexByName, mapping.sold_price.column);
  const soldPrice = formatPrice(soldPriceRaw);
  if (!soldPrice) return null; // No sold price → not a comp.

  const soldDate = formatSoldDate(
    readByMapping(row, indexByName, mapping.sold_date.column),
  );
  const sqft = formatSqft(
    readByMapping(row, indexByName, mapping.sqft.column),
  );
  const yearBuilt = parseYear(
    readByMapping(row, indexByName, mapping.year_built.column),
  );
  const bedrooms = formatIntegerString(
    readByMapping(row, indexByName, mapping.bedrooms.column),
  );
  const bathrooms = formatDecimalString(
    readByMapping(row, indexByName, mapping.bathrooms.column),
  );
  const daysOnMarket = formatIntegerString(
    readByMapping(row, indexByName, mapping.days_on_market.column),
  );
  // FR-2 — derive the sale-to-list ratio from list_price ÷ sold_price. We
  // keep only the ratio on the Comp (the list price itself is never stored).
  const listPriceNum = parsePriceNumber(
    readByMapping(row, indexByName, mapping.list_price.column),
  );
  const soldPriceNum = parsePriceNumber(soldPriceRaw);
  const saleToListPercent =
    listPriceNum && soldPriceNum
      ? `${Math.round((soldPriceNum / listPriceNum) * 100)}%`
      : undefined;

  const fieldConfidence: Partial<Record<CompFieldName, ConfidenceLevel>> = {
    address: confidenceFromAddress(mapping.address_components, row, indexByName),
    soldPrice: bucketConfidence(mapping.sold_price.confidence, !!soldPrice),
    soldDate: bucketConfidence(mapping.sold_date.confidence, !!soldDate),
    squareFeet: bucketConfidence(mapping.sqft.confidence, !!sqft),
    daysOnMarket: bucketConfidence(
      mapping.days_on_market.confidence,
      !!daysOnMarket,
    ),
    // The ratio is only as trustworthy as the weaker of its two inputs.
    saleToListPercent: bucketConfidence(
      Math.min(mapping.list_price.confidence, mapping.sold_price.confidence),
      !!saleToListPercent,
    ),
  };

  return {
    address,
    soldPrice,
    soldDate,
    squareFeet: sqft,
    yearBuilt,
    bedrooms,
    bathrooms,
    daysOnMarket,
    saleToListPercent,
    source: 'imported',
    fieldConfidence,
  };
}

/** Parse a raw price cell ("$258,888.88" / "270000.00") → a positive
 *  number, or null when empty / unparseable / non-positive. */
function parsePriceNumber(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function readByMapping(
  row: string[],
  indexByName: Map<string, number>,
  column: string | null,
): string {
  if (column === null) return '';
  const idx = indexByName.get(column);
  if (idx === undefined) return '';
  return (row[idx] ?? '').trim();
}

function assembleAddress(
  row: string[],
  indexByName: Map<string, number>,
  components: string[],
): string {
  // Component order from Appendix B.4 quirk #1:
  //   <street_num>[ <street_mod>] <street_dir> <street_name> <street_suffix> [<post_dir>][, #<unit>], <city>, <state> <zip>
  const parts: Record<string, string> = {};
  for (const name of components) {
    parts[name] = readByMapping(row, indexByName, name);
  }
  const get = (k: string) => parts[k] ?? '';
  const streetTokens = [
    get('Street Number'),
    get('Street Number Modifier'),
    get('Street Direction'),
    get('Street Name'),
    get('Street Suffix'),
    get('Street Post Direction'),
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  const street = streetTokens.join(' ');
  const unit = get('Unit').trim();
  const city = get('City').trim();
  const state = get('State').trim();
  const zip = get('Zip Code').trim();

  const lines: string[] = [];
  if (street) lines.push(unit ? `${street} #${unit}` : street);
  const cityStateZip = [city, [state, zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  if (cityStateZip) lines.push(cityStateZip);

  return lines.join(', ');
}

/**
 * Address confidence collapses to a 3-level bucket based on how many
 * of the requested components actually had a value in this row. Mostly
 * informational; the renderer flags low-confidence cells visually.
 */
function confidenceFromAddress(
  components: string[],
  row: string[],
  indexByName: Map<string, number>,
): ConfidenceLevel {
  const filled = components.filter(
    (c) => readByMapping(row, indexByName, c).length > 0,
  ).length;
  if (filled === components.length) return 'high';
  if (filled >= Math.max(2, components.length - 2)) return 'medium';
  return 'low';
}

function bucketConfidence(score: number, hasValue: boolean): ConfidenceLevel {
  if (!hasValue) return 'low';
  if (score >= 0.85) return 'high';
  if (score >= 0.6) return 'medium';
  return 'low';
}

function formatPrice(raw: string): string {
  if (!raw) return '';
  // "$258888.88" → "$258,889"; "270000.00" → "$270,000".
  const cleaned = raw.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return '';
  const n = Math.round(parseFloat(cleaned));
  if (!Number.isFinite(n) || n <= 0) return '';
  return `$${n.toLocaleString('en-US')}`;
}

function formatSoldDate(raw: string): string | undefined {
  if (!raw) return undefined;
  // NWMLS exports M/D/YYYY HH:MM:SS AM/PM. Trim time, ISO-format.
  const dateOnly = raw.split(/\s+/)[0];
  const parts = dateOnly.split('/');
  if (parts.length !== 3) {
    // Maybe it's already ISO — keep as-is if it parses.
    const t = Date.parse(raw);
    if (Number.isFinite(t)) {
      return new Date(t).toISOString().slice(0, 10);
    }
    return undefined;
  }
  const [m, d, y] = parts.map((p) => p.trim());
  const yyyy = y.length === 2 ? `20${y}` : y;
  const mm = m.padStart(2, '0');
  const dd = d.padStart(2, '0');
  if (!/^\d{4}$/.test(yyyy) || !/^\d{2}$/.test(mm) || !/^\d{2}$/.test(dd)) {
    return undefined;
  }
  return `${yyyy}-${mm}-${dd}`;
}

function formatSqft(raw: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^0-9]/g, '');
  if (!cleaned) return undefined;
  const n = parseInt(cleaned, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n.toLocaleString('en-US');
}

function parseYear(raw: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^0-9]/g, '').slice(0, 4);
  if (cleaned.length !== 4) return undefined;
  const y = parseInt(cleaned, 10);
  if (!Number.isFinite(y) || y < 1800) return undefined;
  return y;
}

function formatIntegerString(raw: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^0-9]/g, '');
  if (!cleaned) return undefined;
  return cleaned;
}

function formatDecimalString(raw: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return undefined;
  return cleaned;
}

function buildMappingNotes(mapping: ColumnMapping): MappingNote[] {
  return [
    {
      schemaField: 'address',
      sourceColumn: mapping.address_components.join(' + '),
      confidence: mapping.address_components.length > 0 ? 0.9 : 0,
    },
    { schemaField: 'soldPrice', sourceColumn: mapping.sold_price.column, confidence: mapping.sold_price.confidence },
    { schemaField: 'soldDate', sourceColumn: mapping.sold_date.column, confidence: mapping.sold_date.confidence },
    { schemaField: 'squareFeet', sourceColumn: mapping.sqft.column, confidence: mapping.sqft.confidence },
    { schemaField: 'yearBuilt', sourceColumn: mapping.year_built.column, confidence: mapping.year_built.confidence },
    { schemaField: 'bedrooms', sourceColumn: mapping.bedrooms.column, confidence: mapping.bedrooms.confidence },
    { schemaField: 'bathrooms', sourceColumn: mapping.bathrooms.column, confidence: mapping.bathrooms.confidence },
    { schemaField: 'daysOnMarket', sourceColumn: mapping.days_on_market.column, confidence: mapping.days_on_market.confidence },
    { schemaField: 'saleToListPercent', sourceColumn: mapping.list_price.column, confidence: mapping.list_price.confidence },
  ];
}
