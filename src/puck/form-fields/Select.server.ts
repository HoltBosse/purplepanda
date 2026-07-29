import { getDb } from "../../db/db.js";
import { pages, users } from "../../db/schema.js";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import type { SelectOption } from "./Select.js";

const uuidSchema = z.string().uuid();

export async function getUserOptions(): Promise<SelectOption[]> {
  const db = getDb();
  const rows = await db
    .select({ id: users.id, fname: users.fname, lname: users.lname, email: users.email })
    .from(users)
    .where(eq(users.state, 1));

  return rows.map((row) => ({
    label: `${row.fname} ${row.lname}`.trim() || row.email,
    value: row.id,
  }));
}

export async function getContentOptions(contentTypeId: string): Promise<SelectOption[]> {
  const db = getDb();
  const rows = await db
    .select({ id: pages.id, content: pages.content })
    .from(pages)
    .where(and(eq(pages.state, 1), eq(pages.contentType, contentTypeId)));

  return rows.map((row) => {
    const content = row.content as { root?: { props?: Record<string, unknown> } } | null;
    const title = content?.root?.props?.title;
    return {
      label: typeof title === "string" && title ? title : row.id,
      value: row.id,
    };
  });
}

// Used by Select's submission validator (not the editor UI): checks a posted value against the
// live source rather than trusting whatever the "options" prop happened to hold when the form was
// last saved, since that prop only ever reflects the manual source (see Select.tsx's `data`
// resolver comment). uuidSchema guards the id columns from a malformed value that isn't valid
// postgres uuid input, which would otherwise throw instead of just failing validation.
export async function isUserOptionValid(value: string): Promise<boolean> {
  if (!uuidSchema.safeParse(value).success) return false;
  const db = getDb();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.state, 1), eq(users.id, value)))
    .limit(1);
  return rows.length > 0;
}

export async function isContentOptionValid(contentTypeId: string, value: string): Promise<boolean> {
  if (!uuidSchema.safeParse(value).success) return false;
  const db = getDb();
  const rows = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.state, 1), eq(pages.contentType, contentTypeId), eq(pages.id, value)))
    .limit(1);
  return rows.length > 0;
}
