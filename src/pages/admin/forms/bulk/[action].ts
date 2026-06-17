import { forms } from "../../../../db/schema.js";
import { createBulkHandler } from "../../../../bulk/index.js";

export const POST = createBulkHandler(forms, "/admin/forms");
