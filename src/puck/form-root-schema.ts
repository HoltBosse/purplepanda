import * as z from "zod";

// Reply-to points at one of the form's own email-type fields (see FormPuckEditor.tsx), so unlike
// the old user-picker version there's always a sane fallback (no reply-to header at all) when
// none is set — nothing here needs to be required.
export function formRootPropsSchema() {
  return z
    .object({
      replyTo: z.string(),
    })
    .loose();
}
