// How the AI assistant (see ./catalog.ts) should describe a field's value. Puck's built-in field
// types describe themselves, but a `custom` field is just a render function — nothing says what
// it stores — so custom fields whose value the assistant may set carry an `ai` hint: a short
// type/meaning description, or a function returning one for choices only known at runtime (e.g.
// the site theme's scheme ids). Custom fields without a hint are offered as "leave unchanged".
export type AiHint = string | (() => string);

export function withAiHint<TField extends object>(field: TField, ai: AiHint): TField {
  return Object.assign(field, { ai });
}

export function readAiHint(field: unknown): string | undefined {
  const ai = (field as { ai?: unknown } | null | undefined)?.ai;
  if (typeof ai === "function") return String(ai());
  return typeof ai === "string" ? ai : undefined;
}
