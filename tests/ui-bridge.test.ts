import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
class Element {
  textContent = "";
  className = "";
  hidden = false;
  disabled = false;
  type = "";
  onclick?: () => Promise<void>;
  children: Element[] = [];
  attributes: Record<string, string> = {};
  classList = { toggle: () => {} };
  append(...items: Element[]) {
    this.children.push(...items);
  }
  replaceChildren(...items: Element[]) {
    this.children = items;
  }
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }
}
const fixture = {
  app_id: "123",
  name: "Harbor Tabularium",
  kind: "tabularium",
  status: "running",
  revision: 4,
  observed_revision: 4,
  subscription_revision: 2,
  operation_id: null,
  origin: "https://app.example.test",
  console_path: "/hosting/apps/123",
};
function setup() {
  const elements = Object.fromEntries(
    ["apps", "empty", "refresh", "status"].map((key) => [key, new Element()]),
  );
  const sent: Array<{
    type: string;
    id: string;
    name: string;
    input: Record<string, unknown>;
  }> = [];
  const parent = {};
  let listener: (event: unknown) => void = () => {};
  const port = {
    postMessage(message: (typeof sent)[number]) {
      sent.push(message);
    },
    onmessage: null as null | ((event: unknown) => void),
  };
  runInNewContext(
    readFileSync(new URL("../ui/apps.js", import.meta.url), "utf8"),
    {
      document: {
        getElementById: (id: string) => elements[id],
        createElement: () => new Element(),
      },
      location: { hash: "#nonce" },
      crypto,
      parent,
      window: {
        addEventListener: (_name: string, callback: typeof listener) => {
          listener = callback;
        },
      },
      setTimeout: () => 1,
      clearTimeout: () => {},
    },
  );
  const connect = (patch = {}) =>
    listener({
      source: parent,
      data: { type: "webdock:init", nonce: "nonce" },
      ports: [port],
      ...patch,
    });
  const reply = async (index: number, result: unknown, error?: string) => {
    port.onmessage?.({ data: { id: sent[index].id, result, error } });
    await Promise.resolve();
    await Promise.resolve();
  };
  return { elements, sent, port, connect, reply };
}
test("private bridge ignores wrong source, nonce and repeated handshakes", async () => {
  const f = setup();
  f.connect({ source: {} });
  f.connect({ data: { type: "webdock:init", nonce: "wrong" } });
  f.connect({ ports: [] });
  expect(f.sent).toEqual([]);
  f.connect();
  expect(f.sent[0].name).toBe("apps.list");
  await f.reply(0, { apps: [fixture] });
  f.connect();
  expect(f.sent).toHaveLength(1);
  expect(f.elements.apps.children).toHaveLength(1);
  expect(f.elements.status.textContent).toContain("Status refreshed");
});
test("UI restart sends current revisions then refreshes the selected app", async () => {
  const f = setup();
  f.connect();
  await f.reply(0, { apps: [fixture] });
  const controls = f.elements.apps.children[0].children[2].children[1];
  void controls.children[1].onclick?.();
  expect(f.sent[1].name).toBe("apps.restart");
  expect(f.sent[1].input).toEqual({
    app_id: "123",
    revision: 4,
    subscription_revision: 2,
  });
  expect(f.elements.refresh.disabled).toBe(true);
  await f.reply(1, { operation_id: "500", app_id: "123", status: "pending" });
  expect(f.sent[2].name).toBe("apps.get");
  expect(f.sent[2].input).toEqual({ app_id: "123" });
  await f.reply(2, { ...fixture, revision: 5 });
  const nextControls = f.elements.apps.children[0].children[2].children[1];
  expect(nextControls.children.every((button) => button.disabled)).toBe(true);
  expect(f.elements.refresh.disabled).toBe(false);
});
test("empty and failed states remain actionable without fake launch links", async () => {
  const f = setup();
  f.connect();
  await f.reply(0, { apps: [] });
  expect(f.elements.empty.hidden).toBe(false);
  void f.elements.refresh.onclick?.();
  await f.reply(1, null, "Refresh status before retrying.");
  expect(f.elements.status.textContent).toBe("Refresh status before retrying.");
  expect(f.elements.refresh.disabled).toBe(false);
  const script = readFileSync(
    new URL("../ui/apps.js", import.meta.url),
    "utf8",
  );
  expect(script).not.toContain("window.open");
  expect(script).not.toContain("innerHTML");
});

test("failed reconciliation shows operator guidance instead of an endless update", async () => {
  const f = setup();
  f.connect();
  await f.reply(0, { apps: [{ ...fixture, status: "failed", revision: 5 }] });
  const card = f.elements.apps.children[0];
  expect(card.children[0].children[2].textContent).toBe("Failed");
  expect(card.children[1].children[1].children[1].textContent).toBe(
    "Needs operator review",
  );
  expect(card.children[1].children[1].children[2].textContent).toContain(
    "Manage hosting",
  );
  expect(
    card.children[2].children[1].children.every((button) => button.disabled),
  ).toBe(true);
});
