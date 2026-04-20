export interface WsTicketStore {
  issue(userId: string, ttlSec: number): Promise<string>;
  consume(ticket: string): Promise<string | null>;
}
