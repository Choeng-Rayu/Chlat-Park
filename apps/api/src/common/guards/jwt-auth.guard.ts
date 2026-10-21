import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";

import { ACTOR_HEADER, type AccessTokenPayload, type ActorContext } from "../auth/actor.js";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";
import { ApiException } from "../errors/api-exception.js";

/**
 * The authentication guard.
 *
 * It answers *who is the caller*, never *what may they do* — that is the
 * permission guard's job. The two are separate on purpose: an
 * authentication failure (401) and an authorization failure (403) are
 * different answers, and a client needs to be able to tell them apart.
 *
 * The guard is registered globally (`APP_GUARD`) and honours `@Public()`:
 * a public route is passed through untouched.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const controller = context.getClass();

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, controller]) === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      [ACTOR_HEADER]?: ActorContext;
    }>();

    const token = extractToken(request.headers);
    if (!token) {
      throw new ApiException("AUTH_TOKEN_MISSING");
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch (error) {
      throw new ApiException(isTokenExpired(error) ? "AUTH_TOKEN_EXPIRED" : "AUTH_TOKEN_INVALID");
    }

    if (payload.type !== "access") {
      throw new ApiException("AUTH_TOKEN_INVALID", "Only an access token is accepted.");
    }

    const actor: ActorContext = {
      userId: payload.sub,
      role: payload.role,
      scopeKind: payload.scopeKind,
      ownerProfileId: payload.ownerProfileId ?? null,
      guardProfileId: payload.guardProfileId ?? null,
      authzVersion: payload.authzVersion ?? 0,
    };

    request[ACTOR_HEADER] = actor;

    return true;
  }
}

/**
 * Read the bearer token from the `Authorization` header.
 *
 * @internal
 */
function extractToken(headers: Record<string, string | string[] | undefined>): string | undefined {
  const header = headers["authorization"] ?? headers["Authorization"];
  const value = Array.isArray(header) ? header[0] : header;

  if (!value) {
    return undefined;
  }

  const [scheme, token] = value.split(" ");

  if (!token || !scheme || scheme.toLowerCase() !== "bearer") {
    return undefined;
  }

  return token.trim() || undefined;
}

/**
 * Was the token rejected because it had expired?
 *
 * @internal
 */
function isTokenExpired(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "TokenExpiredError"
  );
}
