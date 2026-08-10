import { createBulkHandler } from "../../../../bulk/index.js";
import { pages } from "../../../../db/schema.js";

export const POST = createBulkHandler(pages, "/admin/pages");
