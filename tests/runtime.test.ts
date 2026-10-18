import { expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { createRuntime } from "../src/runtime";
const pair = generateKeyPairSync("ed25519");
const publicKey = pair.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const config = {
  credential: "a".repeat(40),
  hostOrigin: "https://console.webdock.dev",
  publicKey,
  generation: 7,
};
const signed = (patch: Record<string, unknown> = {}) => {
  const claims = {
    v: 1,
    id: crypto.randomUUID(),
    pluginID: "managed-apps",
    generation: 7,
    action: "apps.list",
    projectID: "123",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60,
    ...patch,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return (
    payload +
    "." +
    sign(null, Buffer.from(payload), pair.privateKey).toString("base64url")
  );
};
const body = {
  input: {},
  configuration: {},
  hostOrigin: config.hostOrigin,
};
test("runtime rejects wrong credential, signed action, generation and host origin without service calls", async () => {
  let calls = 0;
  const app = createRuntime(config, () => {
    calls++;
    return {
      apps: {
        async list() {
          return { apps: [] };
        },
        async get() {
          throw Error();
        },
        async command() {
          throw Error();
        },
      },
    };
  });
  for (const [token, authorization, payload] of [
    [signed(), "Bearer wrong", body],
    [signed({ action: "apps.get" }), "Bearer " + config.credential, body],
    [signed({ generation: 6 }), "Bearer " + config.credential, body],
    [
      signed(),
      "Bearer " + config.credential,
      { ...body, hostOrigin: "https://evil.example" },
    ],
  ] as const) {
    const result = await app.handle(
      new Request("https://runtime.local/actions/apps.list", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization,
          "x-plugin-invocation": token,
        },
        body: JSON.stringify(payload),
      }),
    );
    expect(result.status).toBeGreaterThanOrEqual(400);
  }
  expect(calls).toBe(0);
});
test("runtime accepts a current signed project invocation and returns sanitized data", async () => {
  let received = "";
  const app = createRuntime(config, (token) => {
    received = token;
    return {
      apps: {
        async list() {
          return { apps: [] };
        },
        async get() {
          throw Error();
        },
        async command() {
          throw Error();
        },
      },
    };
  });
  const token = signed();
  const result = await app.handle(
    new Request("https://runtime.local/actions/apps.list", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + config.credential,
        "x-plugin-invocation": token,
      },
      body: JSON.stringify(body),
    }),
  );
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ apps: [] });
  expect(received).toBe(token);
});

test("runtime rejects invalid project, plugin, expired invocation and extra configuration", async () => {
  let calls = 0;
  const app = createRuntime(config, () => {
    calls++;
    throw Error("secret");
  });
  for (const [token, payload] of [
    [signed({ projectID: "other-project" }), body],
    [signed({ pluginID: "other-plugin" }), body],
    [signed({ exp: 1 }), body],
    [
      signed(),
      { ...body, configuration: { registry_origin: "https://secret.example" } },
    ],
    [signed(), { ...body, input: { projectID: "456" } }],
  ]) {
    const result = await app.handle(
      new Request("https://runtime.local/actions/apps.list", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + config.credential,
          "x-plugin-invocation": token as string,
        },
        body: JSON.stringify(payload),
      }),
    );
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(await result.text()).not.toContain("secret");
  }
  expect(calls).toBe(0);
});
