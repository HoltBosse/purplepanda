import type * as z from "zod";

// Deliberately no central registry of event/hook names or payload shapes here -- like addAction()
// (../actions/index.js), each call site is free to emit()/runOverride() whatever string+shape it
// wants without touching this file. The cost is that plugin authors don't get autocomplete on event
// names and a typo'd name just silently never fires, checked only by convention/docs, not tsc.
// runOverride's required schema (below) covers the other half of that gap -- a plugin returning the
// wrong shape for a hook it does recognize -- since `override` is typed `(ctx: any) => any` and
// nothing on the plugin's side is compiler-checked against what the call site expects back.
//
// Every override hook is also an observable event under the same name: runOverride() emits `ctx`
// to `on` listeners before consulting `override` handlers, so a plugin can watch a decision point
// happen without competing to make the decision (see the auth:isAdmin/content:validate docs).

export interface PurplePandaPlugin {
  name: string;
  hooks: {
    on?: Record<string, (payload: Record<string, unknown>) => void | Promise<void>>;
    override?: Record<string, (ctx: any) => any>;
  };
}

let plugins: PurplePandaPlugin[] = [];

export function registerPlugins(registered: PurplePandaPlugin[]): void {
  plugins = registered;
}

export async function emit(event: string, payload: Record<string, unknown>): Promise<void> {
  for (const plugin of plugins) {
    const listener = plugin.hooks.on?.[event];
    if (!listener) continue;
    try {
      await listener(payload);
    } catch (err) {
      console.error(`[purplepanda] plugin "${plugin.name}" hook "on.${event}" threw`, err);
    }
  }
}

// Both TResult and TCtx are inferred from the arguments -- TResult from `schema`, TCtx from `ctx`
// -- so callers never need to supply explicit type arguments; the hook's contract lives entirely at
// its one call site instead of a shared interface. `schema` is required (not optional) because this
// is the one place a plugin's return value crosses into code that trusts its shape without further
// checking -- a plugin returning the wrong type is caught here and treated as "no override" rather
// than silently corrupting whatever the call site does next (see auth:isAdmin's non-boolean-return
// discussion).
export async function runOverride<TResult, TCtx = unknown>(
  hook: string,
  ctx: TCtx,
  schema: z.ZodType<TResult>,
): Promise<TResult | undefined> {
  // Unconditional, regardless of whether any plugin actually overrides -- lets a plugin observe
  // this decision point via `on` alone, without registering an `override` handler.
  await emit(hook, ctx as Record<string, unknown>);

  for (const plugin of plugins) {
    const fn = plugin.hooks.override?.[hook];
    if (!fn) continue;
    try {
      const result = await fn(ctx);
      if (result === undefined) continue;

      const parsed = schema.safeParse(result);
      if (!parsed.success) {
        console.error(`[purplepanda] plugin "${plugin.name}" hook "${hook}" returned an invalid value, ignoring`, result);
        continue;
      }
      return parsed.data;
    } catch (err) {
      console.error(`[purplepanda] plugin "${plugin.name}" hook "${hook}" threw`, err);
    }
  }
  return undefined;
}
