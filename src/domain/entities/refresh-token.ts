export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  parentId: string | null;
  replacedById: string | null;
  userAgent: string | null;
  ip: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}
