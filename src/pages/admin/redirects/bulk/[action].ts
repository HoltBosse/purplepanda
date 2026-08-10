import { createBulkHandler } from "../../../../bulk/index.js";
import { redirects } from "../../../../db/schema.js";

export const POST = createBulkHandler(redirects, "/admin/redirects");
