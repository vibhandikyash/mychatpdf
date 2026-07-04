// Renders CMS long-text bodies: blank-line separated paragraphs,
// with "## " lines rendered as h2 headings.
export default function TextBody({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-4">
      {blocks.map((block, i) =>
        block.startsWith("## ") ? (
          <h2 key={i} className="pt-4 text-xl font-semibold text-slate-900">
            {block.slice(3)}
          </h2>
        ) : (
          <p key={i} className="leading-relaxed text-slate-600">
            {block}
          </p>
        )
      )}
    </div>
  );
}
