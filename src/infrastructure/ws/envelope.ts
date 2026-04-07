import { z } from "zod";
import { ValidationError } from "../../domain/errors/domain-errors.ts";

export const ClientEnvelopeSchema = z.object({
  type: z.string(),
  id: z.string().optional(),
  refId: z.string().optional(),
  payload: z.unknown().optional(),
  ts: z.number().optional(),
});

export type ClientEnvelope = z.infer<typeof ClientEnvelopeSchema>;

export function parseEnvelope(raw: string | Buffer): ClientEnvelope {
  let data: unknown;
  try {
    data = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf-8"));
  } catch {
    throw new ValidationError("Invalid JSON");
  }
  const result = ClientEnvelopeSchema.safeParse(data);
  if (!result.success) throw new ValidationError("Invalid envelope");
  return result.data;
}

export function buildAck(refId: string | undefined, payload: unknown): string {
  return JSON.stringify({ type: "ack", refId, payload, ts: Date.now() });
}

export function buildEvent(type: string, payload: unknown, refId?: string): string {
  return JSON.stringify({ type, payload, refId, ts: Date.now() });
}

export function buildError(refId: string | undefined, code: string, message: string): string {
  return JSON.stringify({ type: "error", refId, payload: { code, message }, ts: Date.now() });
}
