import { CircleX } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseSearchQuery } from "./parser.js";
import { buildSuggestions, type Suggestion } from "./suggestions.js";
import type { SearchFieldSpec, ValidatedSearchAst } from "./types.js";
import { validateSearchAst } from "./validate.js";

export interface SearchBarProps {
  /** The searchable fields, driving both validation/highlighting and the autocomplete dropdown. */
  fields: SearchFieldSpec[];
  /** Query-string param name the form submits under. Defaults to "q". */
  name?: string;
  /** Initial query text, typically read server-side from the current URL's search params. */
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}

// Geometry shared VERBATIM by all three stacked layers (colored backdrop, invisible caret-measuring
// mirror, and the real input) so their text lays out pixel-for-pixel identically. Deliberately built
// from plain utilities rather than DaisyUI's `.input` class: `.input` is an inline-flex wrapper with
// `white-space: nowrap` and `gap`, which collapses spaces and injects gaps between the backdrop's
// per-token spans — the real input keeps the spaces, so the layers drift apart the moment you type a
// space. A padding-based box (no fixed height / no flex centering) puts text at the same top-left
// origin in both an <input> and a <div>, which is what keeps them aligned.
//
// `font-kerning: none` + `font-variant-ligatures: none` are essential: the real <input> is one
// continuous text run (kerned between every character), while the colored backdrop is split into
// many per-token <span>s, and browsers don't kern across element boundaries — so each token
// boundary drops a sub-pixel and the layers drift apart as you add more `field:value` terms.
// Disabling kerning/ligatures makes every glyph's advance boundary-independent, so the split-span
// backdrop measures identically to the continuous input.
const LAYER =
  "block w-full box-border pl-3 pr-9 py-2 text-sm font-normal leading-normal border border-solid [font-kerning:none] [font-variant-ligatures:none]";

export default function SearchBar({
  fields,
  name = "q",
  defaultValue = "",
  placeholder = "Search...",
  className,
}: SearchBarProps) {
  const [value, setValue] = useState(defaultValue);
  const [caret, setCaret] = useState(defaultValue.length);
  const [open, setOpen] = useState(false);
  // -1 means "nothing explicitly highlighted": Enter/Tab should submit the form as-is rather than
  // silently swallow the keystroke into completing whatever suggestion happens to be first.
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [dropdownLeft, setDropdownLeft] = useState(0);
  // How far the input has scrolled horizontally (once the query overflows the box). The backdrop and
  // mirror don't scroll on their own, so we translate their content by this amount to track it.
  const [scrollLeft, setScrollLeft] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const caretMirrorRef = useRef<HTMLSpanElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const ast = useMemo(() => parseSearchQuery(value), [value]);
  const validated = useMemo(() => validateSearchAst(ast, fields), [ast, fields]);
  const suggestions = useMemo(() => buildSuggestions(ast, fields, caret), [ast, fields, caret]);
  const errors = useMemo(() => validated.filter((t) => !t.valid && t.error), [validated]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: value/caret/scrollLeft aren't read in the body, they're intentional re-triggers — the mirror's rendered content and position depend on all three, so the caret measurement must redo whenever any of them change
  useLayoutEffect(() => {
    const marker = caretMirrorRef.current;
    const form = formRef.current;
    if (!marker || !form) return;
    // Measure the caret's on-screen x directly from rects (independent of padding/border math): the
    // mirror holds exactly the text before the caret and is translated by the same scrollLeft as the
    // input, so its right edge is where the caret visually sits. Clamp within the field.
    const caretX = marker.getBoundingClientRect().right - form.getBoundingClientRect().left;
    setDropdownLeft(Math.max(0, Math.min(caretX, form.clientWidth - 8)));
  }, [value, caret, scrollLeft]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: suggestions isn't read in the body, it's an intentional re-trigger — the highlighted index must reset whenever the suggestions list changes
  useEffect(() => {
    setHighlightIndex(-1);
  }, [suggestions]);

  const syncCaret = () => {
    const el = inputRef.current;
    if (el) setCaret(el.selectionStart ?? el.value.length);
  };

  const syncScroll = () => {
    const el = inputRef.current;
    if (el) setScrollLeft(el.scrollLeft);
  };

  const syncFromInput = () => {
    syncCaret();
    syncScroll();
  };

  const applySuggestion = (suggestion: Suggestion) => {
    const node = ast.find((n) => caret >= n.start && caret <= n.end);
    const insertText =
      suggestion.kind === "field" ? `${suggestion.field.name}:` : `${suggestion.field.name}:${suggestion.value}`;
    const from = node ? node.start : caret;
    const to = node ? node.end : caret;
    const before = value.slice(0, from);
    const after = value.slice(to);
    const insertion = suggestion.kind === "value" ? `${insertText} ` : insertText;
    const nextValue = before + insertion + after;
    const nextCaret = before.length + insertion.length;

    setValue(nextValue);
    setCaret(nextCaret);
    setOpen(suggestion.kind === "field");

    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
      syncFromInput();
    });
  };

  const clear = () => {
    setValue("");
    setCaret(0);
    setScrollLeft(0);
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" || e.key === "Tab") {
      // Only intercept once the user has explicitly navigated to a suggestion (arrow keys above)
      // — otherwise Enter must submit the query as typed, not silently autocomplete.
      const chosen = highlightIndex >= 0 ? suggestions[highlightIndex] : undefined;
      if (chosen) {
        e.preventDefault();
        applySuggestion(chosen);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const scrollStyle = { transform: `translateX(${-scrollLeft}px)` };

  return (
    <div className={`relative ${className ?? ""}`}>
      {/* No JS required: a plain GET form with a named input submits `?<name>=...` to the current
          URL on Enter, which the server (see documents/index.astro) parses the same way this
          component does client-side. This is also the positioned ancestor the dropdown is offset
          against. */}
      <form ref={formRef} method="GET" className="relative w-full">
        <div className="relative">
          {/* Colored read of the query (github-issue-search style: recognized qualifiers green,
              unrecognized red), painted behind the real, text-transparent input. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--radius-field)] border-transparent bg-base-100 text-base-content ${LAYER}`}
          >
            <div className="whitespace-pre" style={scrollStyle}>
              {value.length === 0 ? (
                // The input's own glyphs (placeholder included) are forced transparent so the
                // colored backdrop can show through, so the placeholder is drawn here instead. The
                // real `placeholder` attribute is kept on the input for screen readers.
                <span className="text-base-content/50">{placeholder}</span>
              ) : (
                renderHighlighted(value, validated)
              )}
            </div>
          </div>

          {/* Invisible mirror measuring the caret's x-offset: its inner span holds only the text
              before the caret. Separate layer from the visible backdrop so measuring can never
              perturb the rendered text. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none invisible absolute inset-0 overflow-hidden border-transparent ${LAYER}`}
          >
            <div className="whitespace-pre" style={scrollStyle}>
              <span ref={caretMirrorRef}>{value.slice(0, caret)}</span>
            </div>
          </div>

          <input
            ref={inputRef}
            type="text"
            name={name}
            value={value}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            className={`relative z-10 rounded-[var(--radius-field)] border-base-content/20 bg-transparent caret-base-content placeholder:text-transparent selection:bg-primary/30 focus:border-base-content focus:outline-2 focus:outline-offset-2 focus:outline-base-content ${LAYER}`}
            // Hide the real input's glyphs so only the colored backdrop shows, keeping the caret
            // visible (caret-base-content is a separate property). `color` is set INLINE — highest
            // specificity — so no component/utility rule can leave the input text faintly showing
            // as a "ghost". WebKit paints input text via -webkit-text-fill-color, ignoring `color`,
            // so it must be zeroed too.
            style={{ color: "transparent", WebkitTextFillColor: "transparent" }}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
              requestAnimationFrame(syncFromInput);
            }}
            onClick={syncFromInput}
            onKeyUp={syncFromInput}
            onScroll={syncScroll}
            onFocus={() => {
              setOpen(true);
              syncFromInput();
            }}
            onBlur={() => {
              // Deferred so a click on a dropdown item or the clear button (which itself blurs the
              // input) still fires before the dropdown/button disappear.
              setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={onKeyDown}
          />

          {value.length > 0 && (
            <button
              type="button"
              aria-label="Clear search"
              className="btn btn-circle btn-ghost btn-xs absolute right-2 top-1/2 z-20 -translate-y-1/2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clear}
            >
              <CircleX size={16} className="text-base-content/50" />
            </button>
          )}
        </div>

        {open && suggestions.length > 0 && (
          <ul
            className="menu absolute top-full z-30 mt-1 w-72 max-w-[90vw] rounded-box border border-base-300 bg-base-100 p-1 shadow-lg"
            style={{ left: dropdownLeft }}
          >
            {suggestions.map((s, i) => (
              <li key={s.kind === "field" ? `field-${s.field.name}` : `value-${s.field.name}-${s.value}`}>
                <button
                  type="button"
                  className={i === highlightIndex ? "active" : ""}
                  // Prevent the input's blur (which would close the dropdown) before onClick fires.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightIndex(i)}
                  onClick={() => applySuggestion(s)}
                >
                  {s.kind === "field" ? (
                    <span className="flex flex-col items-start">
                      <span className="font-mono text-xs">{s.field.name}:</span>
                      {(s.field.label || s.field.description) && (
                        <span className="text-xs text-base-content/60">{s.field.label ?? s.field.description}</span>
                      )}
                    </span>
                  ) : (
                    <span className="font-mono text-xs">
                      {s.field.name}:{s.value}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      {errors.length > 0 && (
        <div className="absolute top-full z-20 mt-1 w-full rounded-box border border-error/30 bg-base-100 p-2 shadow-lg">
          <ul className="space-y-0.5 text-xs text-error">
            {errors.map((t) => (
              <li key={t.node.start}>
                <span className="font-mono">{t.node.raw}</span> — {t.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Renders the query as contiguous colored runs (github-issue-search style) with nothing spliced
// in, so the visible text is a faithful, gap-free mirror of the input's own layout. Caret-position
// measurement is handled separately (see the invisible mirror layer in the component) so it never
// has to perturb this text.
function renderHighlighted(value: string, validated: ValidatedSearchAst) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  validated.forEach((t) => {
    if (t.node.start > cursor) nodes.push(<span key={`gap-${t.node.start}`}>{value.slice(cursor, t.node.start)}</span>);
    // Color (and, for invalid terms, a wavy underline) is the ONLY styling allowed to differ
    // per-token: both leave glyph advance widths untouched. Anything that changes width — most
    // notably font-weight (medium/bold glyphs are wider) — can't be matched by the uniform-weight
    // <input> underneath, so it would make styled tokens drift out of alignment as you add them.
    const className =
      t.node.kind === "text"
        ? ""
        : t.valid
          ? "text-success"
          : "text-error underline decoration-wavy decoration-error";
    nodes.push(
      <span key={t.node.start} className={className}>
        {value.slice(t.node.start, t.node.end)}
      </span>,
    );
    cursor = t.node.end;
  });
  if (cursor < value.length) nodes.push(<span key="tail">{value.slice(cursor)}</span>);

  return nodes;
}

