import { z } from "zod";

export const PresignAttachmentSchema = z.object({
  contentType: z.string().min(1).max(128),
  sizeBytes: z.number().int().min(1).max(50 * 1024 * 1024), // 50 MB max
});
export type PresignAttachmentInput = z.infer<typeof PresignAttachmentSchema>;
