import { createBulkHandler } from "../../../../bulk/index.js";
import { forms } from "../../../../db/schema.js";

export const POST = createBulkHandler(forms, "/admin/forms");
