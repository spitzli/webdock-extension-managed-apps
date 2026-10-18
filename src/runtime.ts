import { Elysia, t } from "elysia";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  createPluginContext,
  verifyInvocation,
} from "@webdock/plugin-sdk/server";
import {
  appAction,
  canonicalOrigin,
  validateAction,
  type AppsContext,
} from "./apps";
export type RuntimeConfig = {
  credential: string;
  hostOrigin: string;
  publicKey: string;
  generation: number;
};
const requestSchema = z.strictObject({
  input: z.unknown(),
  configuration: z.strictObject({}),
  hostOrigin: z.string().max(200),
});
export function createRuntime(
  config: RuntimeConfig,
  context: (token: string) => AppsContext = (token) =>
    createPluginContext({
      hostURL: config.hostOrigin,
      token: () => token,
      runtimeCredential: config.credential,
    }),
) {
  if (
    config.credential.length < 32 ||
    !config.publicKey ||
    !Number.isSafeInteger(config.generation) ||
    config.generation < 1
  )
    throw Error("Plugin runtime configuration required");
  canonicalOrigin(config.hostOrigin);
  return new Elysia({ aot: true })
    .get("/healthz", () => ({
      ok: true,
      pluginID: "managed-apps",
      version: "0.1.0-alpha.1",
      generation: config.generation,
      protocolVersion: 1,
    }))
    .post(
      "/actions/:action",
      async ({ request, params, body, status }) => {
        const supplied = Buffer.from(
          request.headers.get("authorization") ?? "",
        );
        const expected = Buffer.from("Bearer " + config.credential);
        if (
          supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected)
        )
          return status(401, { error: "Unauthorized runtime" });
        try {
          const token = request.headers.get("x-plugin-invocation") ?? "";
          const claims = verifyInvocation(token, {
            publicKey: config.publicKey,
            pluginID: "managed-apps",
            generation: config.generation,
          });
          const payload = requestSchema.parse(body);
          if (
            claims.action !== params.action ||
            payload.hostOrigin !== config.hostOrigin
          )
            throw Error("Invocation mismatch");
          validateAction(params.action, payload.input);
          return await appAction(context(token), params.action, payload.input);
        } catch {
          return status(400, {
            error:
              "App action failed. Refresh the app status and check your project access before trying again.",
          });
        }
      },
      { body: t.Unknown() },
    );
}
