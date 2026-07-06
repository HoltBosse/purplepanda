import { tags } from "../../../../db/schema.js";
import { createBulkHandler } from "../../../../bulk/index.js";

export const POST = createBulkHandler(tags, "/admin/tags");
