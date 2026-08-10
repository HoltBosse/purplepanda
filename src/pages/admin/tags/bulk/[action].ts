import { createBulkHandler } from "../../../../bulk/index.js";
import { tags } from "../../../../db/schema.js";

export const POST = createBulkHandler(tags, "/admin/tags");
