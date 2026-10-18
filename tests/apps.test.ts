import { expect, test } from "bun:test";
import { appAction } from "../src/apps";
const app = {
  app_id: "123",
  name: "Harbor Tabularium",
  kind: "tabularium",
  status: "running",
  revision: 3,
  observed_revision: 3,
  subscription_revision: 2,
  operation_id: null,
  origin: "https://apps.example.test",
  console_path: "/hosting/apps/123",
};
function fixture() {
  const calls: unknown[] = [];
  return {
    calls,
    ctx: {
      apps: {
        async list() {
          calls.push("list");
          return { apps: [{ ...app, secret: "never expose" }] };
        },
        async get(input: unknown) {
          calls.push(input);
          return app;
        },
        async command(input: unknown) {
          calls.push(input);
          return {
            operation_id: "456",
            app_id: "123",
            status: "pending",
            secret: "never expose",
          };
        },
      },
    },
  };
}
test("lists only the app operation contract and strips provider secrets", async () => {
  const { ctx } = fixture();
  expect(await appAction(ctx, "apps.list", {})).toEqual({ apps: [app] });
});
test("forwards revisions and operation without tenant selectors", async () => {
  const { ctx, calls } = fixture();
  expect(
    await appAction(ctx, "apps.restart", {
      app_id: "123",
      revision: 3,
      subscription_revision: 2,
    }),
  ).toEqual({ operation_id: "456", app_id: "123", status: "pending" });
  expect(calls).toEqual([
    {
      app_id: "123",
      operation: "restart",
      revision: 3,
      subscription_revision: 2,
    },
  ]);
});
test("rejects unknown actions, tenant selectors and unsafe revisions before service access", async () => {
  const { ctx, calls } = fixture();
  for (const [action, input] of [
    ["registry.branding.update", {}],
    ["apps.delete", {}],
    ["apps.list", { projectID: "2" }],
    ["apps.get", { app_id: "123", tenant_id: "2" }],
    ["apps.start", { app_id: "123", revision: -1, subscription_revision: 2 }],
    [
      "apps.stop",
      {
        app_id: "123",
        revision: 3,
        subscription_revision: 2,
        provider: "admin",
      },
    ],
    ["apps.restart", { app_id: "123", revision: 3 }],
  ])
    await expect(appAction(ctx, action as string, input)).rejects.toThrow();
  expect(calls).toEqual([]);
});
test("rejects unsafe app URLs and non-hosting console paths", async () => {
  for (const patch of [
    { origin: "http://app.example" },
    { origin: "https://user:pass@app.example" },
    { origin: "https://app.example/path" },
    { console_path: "//evil.example" },
    { console_path: "/hosting/apps/123?token=secret" },
    { console_path: "/projects/2" },
    { console_path: "/hosting/apps/999" },
  ]) {
    const { ctx } = fixture();
    ctx.apps.get = async () => ({ ...app, ...patch });
    await expect(
      appAction(ctx, "apps.get", { app_id: "123" }),
    ).rejects.toThrow();
  }
});
test("propagates service rejection without mutating a replacement project", async () => {
  const { ctx } = fixture();
  ctx.apps.command = async () => {
    throw Error("revision conflict");
  };
  await expect(
    appAction(ctx, "apps.stop", {
      app_id: "123",
      revision: 1,
      subscription_revision: 2,
    }),
  ).rejects.toThrow("revision conflict");
});
