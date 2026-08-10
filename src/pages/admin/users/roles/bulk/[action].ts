import { createBulkHandler } from "../../../../../bulk/index.js";
import { roles } from "../../../../../db/schema.js";

export const POST = createBulkHandler(roles, "/admin/users/roles");
