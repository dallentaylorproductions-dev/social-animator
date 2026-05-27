/**
 * Decorative "lines of text" stand-in for the document-style posters.
 * Used by DocPoster + the front slide of PresentationPoster.
 */
export function LineGroup({
  lines = 3,
  widths = ['100%', '85%', '60%'],
}: {
  lines?: number;
  widths?: string[];
}) {
  return (
    <div className="line-group">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="line"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  );
}
