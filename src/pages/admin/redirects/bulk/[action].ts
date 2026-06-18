import { redirects } from "../../../../db/schema.js";
import { createBulkHandler } from "../../../../bulk/index.js";

export const POST = createBulkHandler(redirects, "/admin/redirects");
