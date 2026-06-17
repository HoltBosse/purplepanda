import { documents } from "../../../../db/schema.js";
import { createBulkHandler } from "../../../../bulk/index.js";

export const POST = createBulkHandler(documents, "/admin/documents");
