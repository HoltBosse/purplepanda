import { createBulkHandler } from "../../../../bulk/index.js";
import { documents } from "../../../../db/schema.js";

export const POST = createBulkHandler(documents, "/admin/documents");
