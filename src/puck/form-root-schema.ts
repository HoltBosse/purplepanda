import * as z from "zod";

// Forms need somewhere to route submitter replies, so Reply-to is required regardless of
// whatever else ends up in root.props (notifyUserIds, redirectPage, etc.).
export function formRootPropsSchema() {
  return z
    .object({
      replyTo: z.string().trim().min(1, "Reply-to is required"),
    })
    .loose();
}
