/** UI fixture only. No Hosting, Kubernetes, database or real app is contacted. */
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRuntime } from "../src/runtime";
import { verifyInvocation } from "@webdock/plugin-sdk/server";
import manifest from "../tabularium.json";
const origin = "http://127.0.0.1:3490",
  uiOrigin = "http://127.0.0.1:3491";
const pair = generateKeyPairSync("ed25519"),
  credential = randomBytes(32).toString("hex"),
  nonce = randomBytes(32).toString("hex");
const config = {
  credential,
  publicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  generation: 1,
  hostOrigin: "https://callback.fixture.test",
};
let app = {
  app_id: "123",
  name: "Harbor Tabularium",
  kind: "tabularium" as const,
  status: "running",
  revision: 4,
  observed_revision: 4,
  subscription_revision: 1,
  operation_id: null as string | null,
  origin: "https://tabularium.example.test",
  console_path: "/hosting/apps/123",
};
const events: Array<{ action: string; status: number }> = [];
const runtime = createRuntime(config, (token) => {
  const claims = verifyInvocation(token, {
    publicKey: config.publicKey,
    pluginID: "managed-apps",
    generation: 1,
  });
  const capability = (cap: string) => {
    if (
      claims.projectID !== "123" ||
      !manifest.actions
        .find((a) => a.name === claims.action)
        ?.capabilities.includes(cap)
    )
      throw Error("Denied");
  };
  return {
    apps: {
      async list() {
        capability("plugin.apps.read");
        return { apps: [app] };
      },
      async get({ app_id }) {
        capability("plugin.apps.read");
        if (app_id !== app.app_id) throw Error("Denied");
        return app;
      },
      async command(input) {
        capability("plugin.apps.manage");
        if (
          input.app_id !== app.app_id ||
          input.revision !== app.revision ||
          input.subscription_revision !== app.subscription_revision ||
          app.revision !== app.observed_revision
        )
          throw Error("Stale state");
        app = {
          ...app,
          revision: app.revision + 1,
          operation_id: String(500 + app.revision),
        };
        setTimeout(() => {
          app = {
            ...app,
            status: input.operation === "stop" ? "stopped" : "running",
            observed_revision: app.revision,
          };
        }, 1200);
        return {
          app_id: app.app_id,
          operation_id: app.operation_id!,
          status: "pending",
        };
      },
    },
  };
});
const ui = Bun.serve({
  hostname: "127.0.0.1",
  port: 3491,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.host !== "127.0.0.1:3491" || request.method !== "GET")
      return new Response("Denied", { status: 403 });
    const file: { [key: string]: [string, string] } = {
      "/ui/apps": ["apps.html", "text/html"],
      "/ui/apps.js": ["apps.js", "application/javascript"],
      "/ui/apps.css": ["apps.css", "text/css"],
    };
    const entry = file[url.pathname];
    if (!entry) return new Response("Not found", { status: 404 });
    return new Response(
      await readFile(new URL("../ui/" + entry[0], import.meta.url)),
      {
        headers: {
          "Content-Type": entry[1],
          "Cache-Control": "no-store",
          "Content-Security-Policy": `default-src 'none'; script-src 'self'; style-src 'self'; frame-ancestors ${origin}; connect-src 'none'; base-uri 'none'; form-action 'none'`,
        },
      },
    );
  },
});
const host = Bun.serve({
  hostname: "127.0.0.1",
  port: 3490,
  maxRequestBodySize: 32768,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.host !== "127.0.0.1:3490")
      return new Response("Denied", { status: 403 });
    if (request.method === "GET" && url.pathname === "/proof")
      return Response.json({ fixture: true, events, app });
    if (request.method === "GET" && url.pathname === "/")
      return new Response(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Managed Apps · UI fixture</title><style>body{margin:0;background:#f5f8fc;font:13px 'Segoe UI',sans-serif;color:#243b58}header{padding:12px 40px;background:#e8eef7;border-bottom:1px solid #ccd8e7}aside{padding:12px 40px;background:white;font-size:12px}iframe{display:block;width:100%;height:740px;border:0}</style><header>Local UI fixture · Fictional Harbor project · No real Hosting operations</header><aside>Production Console provides trusted Open app and Manage hosting links above this panel.</aside><iframe title="Managed Apps" sandbox="allow-scripts" src="${uiOrigin}/ui/apps#${nonce}"></iframe><script>const frame=document.querySelector('iframe');frame.onload=()=>{const channel=new MessageChannel();channel.port1.onmessage=async event=>{const {id,name,input,type}=event.data;if(type!=='action')return;try{const response=await fetch('/action',{method:'POST',headers:{'Content-Type':'application/json','X-Preview-Key':'${nonce}'},body:JSON.stringify({name,input})});const result=await response.json();channel.port1.postMessage(response.ok?{id,result}:{id,error:'App action failed. Refresh status and try again.'});}catch{channel.port1.postMessage({id,error:'App action failed'});}};frame.contentWindow.postMessage({type:'webdock:init',nonce:'${nonce}'},'*',[channel.port2]);};</script></html>`,
        {
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "no-store",
            "Content-Security-Policy": `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src ${uiOrigin}; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'`,
          },
        },
      );
    if (
      request.method !== "POST" ||
      url.pathname !== "/action" ||
      request.headers.get("origin") !== origin ||
      request.headers.get("x-preview-key") !== nonce
    )
      return new Response("Denied", { status: 403 });
    try {
      const { name, input } = (await request.json()) as {
        name: string;
        input: unknown;
      };
      if (!manifest.actions.some((action) => action.name === name))
        throw Error("Unsupported");
      const now = Math.floor(Date.now() / 1000),
        payload = Buffer.from(
          JSON.stringify({
            v: 1,
            id: crypto.randomUUID(),
            pluginID: "managed-apps",
            projectID: "123",
            generation: 1,
            action: name,
            iat: now,
            exp: now + 60,
          }),
        ).toString("base64url");
      const token =
        payload +
        "." +
        sign(null, Buffer.from(payload), pair.privateKey).toString("base64url");
      const response = await runtime.handle(
        new Request("https://runtime.fixture.test/actions/" + name, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            authorization: "Bearer " + credential,
            "x-plugin-invocation": token,
          },
          body: JSON.stringify({
            input,
            configuration: {},
            hostOrigin: config.hostOrigin,
          }),
        }),
      );
      events.push({ action: name, status: response.status });
      return response;
    } catch {
      return Response.json({ error: "Preview action failed" }, { status: 400 });
    }
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await host.stop(true);
    await ui.stop(true);
    process.exit(0);
  });
console.log(JSON.stringify({ ready: true, fixture: true, url: origin }));
