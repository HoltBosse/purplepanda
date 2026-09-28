import DOMPurify from "dompurify";

// Browser-side counterpart of sanitize-html.server.ts. Only meaningful where a real DOM exists;
// without one DOMPurify can't parse, so this fails closed and returns nothing rather than the
// unsanitized input.
export function sanitizeHtml(html: string): string {
  return DOMPurify.isSupported ? DOMPurify.sanitize(html) : "";
}
