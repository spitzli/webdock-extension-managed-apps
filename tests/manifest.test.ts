import { expect, test } from "bun:test";
import { parsePluginManifest } from "@webdock/plugin-sdk/contracts";
import manifest from "../tabularium.json";
test("manifest exposes only scoped app operations through UI API and MCP", () => {
  expect(() => parsePluginManifest(manifest)).not.toThrow();
  expect(manifest.actions.map((action) => action.name)).toEqual([
    "apps.list",
    "apps.get",
    "apps.start",
    "apps.stop",
    "apps.restart",
  ]);
  expect(manifest.capabilities).toEqual([
    "plugin.apps.read",
    "plugin.apps.manage",
  ]);
  expect(manifest.services.required).toEqual([{ name: "apps", version: 1 }]);
  expect(manifest.httpBindings).toEqual([]);
  expect(manifest.secrets).toEqual([]);
  expect(manifest.api.map((route) => route.action)).toEqual(
    manifest.actions.map((action) => action.name),
  );
  expect(manifest.mcp.map((route) => route.action)).toEqual(
    manifest.actions.map((action) => action.name),
  );
});
