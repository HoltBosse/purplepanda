import createDOMPurify, { type WindowLike } from "dompurify";
import { JSDOM } from "jsdom";

// DOMPurify needs a DOM to parse into; server-side that's jsdom, the DOM it officially supports
// outside the browser. (happy-dom, although installed for @tiptap/html, looks supported but
// silently returns its input unsanitized.)
const purify = createDOMPurify(new JSDOM("").window as unknown as WindowLike);

export function sanitizeHtml(html: string): string {
  return purify.sanitize(html);
}
