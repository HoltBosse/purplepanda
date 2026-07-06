import { roles } from "../../../../../db/schema.js";
import { createBulkHandler } from "../../../../../bulk/index.js";

export const POST = createBulkHandler(roles, "/admin/users/roles");
