import type { WsTicketStore } from "../../../domain/ports/services/ws-ticket-store.ts";

interface Deps {
  ticketStore: WsTicketStore;
  ticketTtlSec: number;
}

export class IssueWsTicket {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<string> {
    return this.deps.ticketStore.issue(userId, this.deps.ticketTtlSec);
  }
}
