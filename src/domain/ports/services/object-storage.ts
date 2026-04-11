export interface PresignedPut {
  url: string;
  key: string;
  expiresAt: Date;
}

export interface ObjectStorage {
  presignPut(key: string, contentType: string, sizeMaxBytes: number, ttlSec: number): Promise<PresignedPut>;
  headObject(key: string): Promise<boolean>;
  publicUrl(key: string): string;
}
