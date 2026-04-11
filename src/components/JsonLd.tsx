// src/components/JsonLd.tsx
// Safely emit a JSON-LD <script type="application/ld+json"> from server-rendered
// React, without using dangerouslySetInnerHTML.
//
// Why this is safe:
//  1. `encode()` turns the object into a JSON string and then unicode-escapes
//     every <, >, &, U+2028 and U+2029. The resulting string contains NONE of
//     the characters an HTML parser could mistake for markup — a post that
//     contains "</script>" becomes "\u003c/script\u003e", which is still
//     perfectly valid JSON (JSON.parse handles \uXXXX escapes) but cannot
//     break out of the surrounding <script> tag.
//  2. The escaped string is passed as a plain text child of <script>. React's
//     server renderer emits text children of raw-text elements (script, style)
//     verbatim, and even if any HTML-escaping happened, there are no <, >, or
//     & characters left in the output for it to act on.
//
// This is the React-docs-recommended pattern for JSON-in-script, adapted to
// avoid the raw-HTML injection API entirely.
//
// Usage (inside a <Head> block):
//   <JsonLd data={articleJsonLd} />

type JsonLdProps = {
  data: unknown;
};

function encode(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script type="application/ld+json">
      {encode(data)}
    </script>
  );
}
