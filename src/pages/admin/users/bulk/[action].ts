import { createBulkHandler } from "../../../../bulk/index.js";
import { users } from "../../../../db/schema.js";

export const POST = createBulkHandler(users, "/admin/users");
