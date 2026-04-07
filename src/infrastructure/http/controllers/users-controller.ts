import type { RouteHandler } from "../compose.ts";
import type { GetUser } from "../../../application/use-cases/users/get-user.ts";
import type { UpdateProfile } from "../../../application/use-cases/users/update-profile.ts";
import { validate } from "../validation/validate.ts";
import { UpdateProfileSchema } from "../../../application/dtos/user-dtos.ts";

interface Deps {
  getUser: GetUser;
  updateProfile: UpdateProfile;
}

export class UsersController {
  constructor(private readonly deps: Deps) {}

  getMe: RouteHandler = async (_req, ctx) => {
    const user = await this.deps.getUser.execute(ctx.userId!);
    return Response.json({ user });
  };

  updateMe: RouteHandler = async (req, ctx) => {
    const body = validate(UpdateProfileSchema, await req.json());
    const user = await this.deps.updateProfile.execute(ctx.userId!, body);
    return Response.json({ user });
  };

  getById: RouteHandler = async (req, _ctx) => {
    const id = new URL(req.url).pathname.split("/").pop()!;
    const user = await this.deps.getUser.execute(id);
    return Response.json({ user });
  };
}
