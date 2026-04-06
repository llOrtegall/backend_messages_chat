export type EmailTokenKind = "verify" | "reset";

export interface EmailToken {
  id: string;
  userId: string;
  kind: EmailTokenKind;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}
