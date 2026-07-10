import { getDb } from "../db/db.js";
import { userActions } from "../db/schema.js";

export async function addAction(
  type: string,
  action: object,
  userId: string,
): Promise<void> {
  const db = getDb();

  await db.insert(userActions).values({
    type,
    data: action,
    userId,
  });
}
