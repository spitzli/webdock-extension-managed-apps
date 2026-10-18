import { z } from "zod";
import {
  managedAppSchema,
  managedAppGetSchema,
  managedAppCommandSchema,
  managedAppOperationSchema,
} from "@webdock/plugin-sdk/contracts";
import type { PluginApps } from "@webdock/plugin-sdk/contracts";
export function canonicalOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== value)
    throw Error("Canonical HTTPS origin required");
  return value;
}
const output = managedAppSchema.strip();
const inputs = {
  "apps.list": z.strictObject({}),
  "apps.get": managedAppGetSchema,
  "apps.start": managedAppCommandSchema.omit({ operation: true }),
  "apps.stop": managedAppCommandSchema.omit({ operation: true }),
  "apps.restart": managedAppCommandSchema.omit({ operation: true }),
};
export function validateAction(name: string, input: unknown) {
  if (!Object.hasOwn(inputs, name)) throw Error("Unsupported app action");
  return inputs[name as keyof typeof inputs].parse(input);
}
export type AppsContext = { apps: PluginApps };
export async function appAction(
  context: AppsContext,
  name: string,
  input: unknown,
): Promise<unknown> {
  const args = validateAction(name, input);
  switch (name) {
    case "apps.list":
      return z
        .object({ apps: z.array(output).max(100) })
        .parse(await context.apps.list());
    case "apps.get":
      return output.parse(
        await context.apps.get(managedAppGetSchema.parse(args)),
      );
    default:
      return managedAppOperationSchema
        .strip()
        .parse(
          await context.apps.command(
            managedAppCommandSchema.parse({
              ...args,
              operation: name.slice(5),
            }),
          ),
        );
  }
}
