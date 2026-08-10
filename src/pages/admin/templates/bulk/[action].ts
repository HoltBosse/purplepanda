import { createBulkHandler } from "../../../../bulk/index.js";
import { templates } from "../../../../db/schema.js";

export const POST = createBulkHandler(templates, "/admin/templates");
