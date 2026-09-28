import { eq, getTableColumns, getTableName, inArray, is, sql } from "drizzle-orm";
import { type AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { getDb } from "../db/db.js";
import * as dbSchema from "../db/schema.js";
import { actionSchemas, userActions } from "../db/schema.js";
import { emit } from "../hooks/index.js";

type PlaceholderSpec = {
  lookupColumn: AnyPgColumn;
  displayColumn: AnyPgColumn;
  // Path into `displayColumn` when the human-readable value lives inside a jsonb document
  // instead of being a plain column, e.g. Puck's `content.root.props.title`.
  displayPath?: string[];
};

type ActionOptions<TPayload extends Record<string, unknown>> = {
  message: string;
  placeholders?: {
    [K in keyof TPayload]?: PlaceholderSpec;
  };
};

// The DB only stores column references as plain strings, since drizzle Column objects
// can't round-trip through jsonb. `resolveColumn` below turns them back into the live
// column objects `describeAction` needs to run a query.
type SerializedPlaceholderSpec = {
  table: string;
  lookupColumn: string;
  displayColumn: string;
  displayPath?: string[];
};

type SerializedActionSchema = {
  message: string;
  placeholders?: Record<string, SerializedPlaceholderSpec>;
};

const tablesByName = new Map<string, PgTable>();
for (const value of Object.values(dbSchema)) {
  if (is(value, PgTable)) {
    tablesByName.set(getTableName(value), value);
  }
}

function resolveColumn(tableName: string, columnName: string): AnyPgColumn | undefined {
  const table = tablesByName.get(tableName);
  if (!table) return undefined;

  return Object.values(getTableColumns(table)).find((column) => column.name === columnName) as
    | AnyPgColumn
    | undefined;
}

// When `displayPath` is set, `displayColumn` is a jsonb column and the human-readable value is
// nested inside it (e.g. Puck's `content.root.props.title`) rather than being the column itself.
function buildDisplayField(displayColumn: AnyPgColumn, displayPath?: string[]) {
  if (!displayPath || displayPath.length === 0) return displayColumn;

  const pgPath = `{${displayPath.join(",")}}`;
  return sql<string>`${displayColumn} #>> ${pgPath}::text[]`;
}

function serializeSchema(options: ActionOptions<Record<string, unknown>>): SerializedActionSchema {
  if (!options.placeholders) return { message: options.message };

  const placeholders: Record<string, SerializedPlaceholderSpec> = {};
  for (const [key, spec] of Object.entries(options.placeholders)) {
    if (!spec) continue;
    placeholders[key] = {
      table: getTableName(spec.lookupColumn.table),
      lookupColumn: spec.lookupColumn.name,
      displayColumn: spec.displayColumn.name,
      ...(spec.displayPath ? { displayPath: spec.displayPath } : {}),
    };
  }

  return { message: options.message, placeholders };
}

export async function addAction<TPayload extends Record<string, unknown>>(
  type: string,
  payload: TPayload,
  userId: string,
  options: ActionOptions<TPayload>,
): Promise<void> {
  const db = getDb();
  const schema = serializeSchema(options as ActionOptions<Record<string, unknown>>);

  await db
    .insert(actionSchemas)
    .values({ type, schema })
    .onConflictDoUpdate({ target: actionSchemas.type, set: { schema } });

  await db.insert(userActions).values({
    type,
    data: payload,
    userId,
  });

  await emit(type, payload);
}

export async function describeAction(action: { type: string; data: unknown }): Promise<string> {
  const db = getDb();

  const [schemaRow] = await db
    .select({ schema: actionSchemas.schema })
    .from(actionSchemas)
    .where(eq(actionSchemas.type, action.type))
    .limit(1);

  if (!schemaRow) return action.type;

  const schema = schemaRow.schema as SerializedActionSchema;
  const payload = (action.data ?? {}) as Record<string, unknown>;
  const resolved = new Map<string, string>();

  for (const [, key] of schema.message.matchAll(/\{(\w+)\}/g)) {
    if (resolved.has(key!) || !(key! in payload)) continue;

    const value = payload[key!];
    const placeholder = schema.placeholders?.[key!];
    const lookupColumn = placeholder && resolveColumn(placeholder.table, placeholder.lookupColumn);
    const displayColumn = placeholder && resolveColumn(placeholder.table, placeholder.displayColumn);

    if (lookupColumn && displayColumn && Array.isArray(value)) {
      // A list of ids (e.g. several media uploaded at once) resolves each one, keeping the
      // payload's order and falling back to the raw id for any that no longer exist.
      const rows = value.length === 0 ? [] : await db
        .select({
          lookup: lookupColumn,
          display: buildDisplayField(displayColumn, placeholder.displayPath),
        })
        .from(lookupColumn.table)
        .where(inArray(lookupColumn, value));
      const displayByLookup = new Map(rows.map((row) => [String(row.lookup), row.display]));
      resolved.set(
        key!,
        value
          .map((item) => {
            const display = displayByLookup.get(String(item));
            return display != null ? String(display) : String(item);
          })
          .join(", "),
      );
    } else if (lookupColumn && displayColumn && value != null) {
      const [row] = await db
        .select({ display: buildDisplayField(displayColumn, placeholder.displayPath) })
        .from(lookupColumn.table)
        .where(eq(lookupColumn, value))
        .limit(1);
      resolved.set(key!, row?.display != null ? String(row.display) : String(value));
    } else {
      resolved.set(key!, String(value));
    }
  }

  return schema.message.replace(/\{(\w+)\}/g, (match, key) => resolved.get(key) ?? match);
}
