import { createBulkHandler } from "../../../../bulk/index.js";
import { entityKindFilter } from "../../../../db/content-types.js";
import { pages } from "../../../../db/schema.js";

export const POST = createBulkHandler(pages, "/admin/pages", undefined, entityKindFilter(null));
