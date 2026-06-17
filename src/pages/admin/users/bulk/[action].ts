import { users } from "../../../../db/schema.js";
import { createBulkHandler } from "../../../../bulk/index.js";

export const POST = createBulkHandler(users, "/admin/users");
