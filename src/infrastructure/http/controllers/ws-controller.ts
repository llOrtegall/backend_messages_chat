import type { RouteHandler } from "../compose.ts";
import type { IssueWsTicket } from "../../../application/use-cases/ws/issue-ws-ticket.ts";

interface Deps {
  issueWsTicket: IssueWsTicket;
}

export class WsController {
  constructor(private readonly deps: Deps) {}

  issueTicket: RouteHandler = async (_req, ctx) => {
    const ticket = await this.deps.issueWsTicket.execute(ctx.userId!);
    return Response.json({ ticket });
  };
}
