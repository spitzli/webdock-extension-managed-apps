# Managed Apps

![Managed Apps icon](assets/icon.svg)

Operate dedicated applications already connected to your project.

## What you can do

List the existing Tabularium instance, inspect its status and address, and start, stop or restart through Hosting.

## Setup and access

Requires the host apps service, project grants and trusted Console launch links. Provisioning remains in the operator Hosting workflow; the plugin does not create subscriptions or configure application internals.

## Data and security

Core checks project authority, binding and revisions for every operation. No cluster/database credentials or application admin token enters the panel. Stopping retains data according to the underlying Hosting policy.

## Status and limits

Developer alpha. A stock host without the apps service cannot run it; production Console installation is a separate gate. Gallery operations are simulated against a fictional project and contact no real application.

Catalog publication does not activate the plugin, enable public signup or grant
access to any customer resource. A new presentation release must use a new version;
previously signed releases and their assets stay immutable.

## Gallery context

The screenshots below show existing local authoring/test views with fictional
project data. They do not attest a live provider or customer deployment.

## Catalog source

`.tabularium` is the complete catalog-refresh source. It retains the immutable
runtime image and full protocol/access contract of the currently released
`0.1.0-alpha.1` and adds the prepared presentation assets. Refresh it only from a
reviewed immutable source commit. This does not replace signed release assets
or activate the runtime.

## Technical reference

The retained implementation notes below include platform integration procedures.
Commands referring to Core, `tools/` or `apps/console` require the [platform source
checkout](https://github.com/spitzli/webdock); they are not standalone setup steps.

Operate dedicated applications connected to a Webdock project. The initial app is **Tabularium**: view its status and address, then start, stop or restart the instance. Webdock Console provides trusted **Open app** and **Manage hosting** links above the plugin panel.

Provisioning stays in the existing operator Hosting workflow. This extension manages existing instances; it does not provision apps, configure their internal business settings, or manage subscriptions. Shared Umami analytics remains a separate service.

## Release status

Developer alpha `0.1.0-alpha.1`. The manifest pins the reviewed OCI image by digest. This release is not installed in the production Console. The host must include the `apps` service, capabilities and Console launch links added for this extension. A stock host without that service cannot run it.

## Surfaces

| Action         | Input                                         | Capability           |
| -------------- | --------------------------------------------- | -------------------- |
| `apps.list`    | `{}`                                          | `plugin.apps.read`   |
| `apps.get`     | `app_id`                                      | `plugin.apps.read`   |
| `apps.start`   | `app_id`, `revision`, `subscription_revision` | `plugin.apps.manage` |
| `apps.stop`    | Same                                          | `plugin.apps.manage` |
| `apps.restart` | Same                                          | `plugin.apps.manage` |

All actions are exposed through the manifest's API and MCP routes. Reads return the narrow managed app contract. Commands return `{operation_id, app_id, status}`; refresh status to observe completion. The host derives project authority from a verified invocation, checks its operator binding and current revisions, and executes the existing Hosting operation. Stopping preserves database and persistent storage according to Hosting semantics.

No tenant selector, HTTP binding, provider URL, cluster credential, database credential or application admin token is accepted by the extension. Internal branding, kinds, manifests and sign-in settings remain inside the dedicated application.

## Run and verify

```sh
bun install --frozen-lockfile --ignore-scripts
bun test
bun run build
docker build -t webdock-managed-apps:0.1.0-alpha.1 .
bun run test:image
bun run preview
```

The preview at `http://127.0.0.1:3490` uses a clearly labeled in-memory UI fixture. It exercises signed runtime invocations and the scripts-only MessagePort UI with simulated app operations. It does **not** contact Hosting, Kubernetes, a database or a deployed Tabularium. `/proof` records fixture actions for browser acceptance. No production or real deployment evidence is implied by this preview.

The SDK tarball in `vendor/` includes the host's new `apps` contract. No new runtime framework is introduced.

## Screenshots

Local UI fixture with a fictional Harbor project and simulated Hosting operations. Production Console supplies trusted app and Hosting links above the panel.

![Dedicated Tabularium app running](screenshots/managed-apps-running.png)

![Dedicated Tabularium app stopped](screenshots/managed-apps-stopped.png)

## Deployment boundary

Private runtime on port **3443**, TLS required. Public UI upstream on port **3444**, exposed only through an HTTPS proxy. Never route the action listener publicly. Container runs as `bun` and supports a read-only filesystem.

Required environment:

- `WEBDOCK_PLUGIN_RUNTIME_TOKEN`: host-provisioned random bearer credential, at least 32 characters.
- `WEBDOCK_PLUGIN_HOST_URL`: canonical HTTPS host callback origin.
- `WEBDOCK_PLUGIN_CONSOLE_ORIGIN`: canonical HTTPS Console origin for iframe ancestry.
- `WEBDOCK_PLUGIN_HOST_PUBLIC_KEY`: Ed25519 public key PEM for invocation verification.
- `WEBDOCK_PLUGIN_GENERATION`: active positive installation generation.
- `WEBDOCK_PLUGIN_TLS_CERT`, `WEBDOCK_PLUGIN_TLS_KEY`: mounted private runtime TLS files.

Runtime requests require the bearer credential plus a current signed `X-Plugin-Invocation`. The plugin verifies plugin ID, generation, action, project claim format, lifetime and callback origin. The host rechecks live project authority and binding on every `apps` service call. Errors exposed to the UI are generic and contain no provider details.

The iframe uses `sandbox="allow-scripts"`, a one-time nonce handshake and a private MessagePort. It cannot fetch providers, submit forms or open popups. App addresses are plain text; navigation is owned by authenticated Console chrome outside the iframe.

## Blacksmith CI

The Blacksmith GitHub App is installed for the exact 16 Spitzli platform, plugin and SDK repositories. The configured and observed region is `us-west`, under the owner’s EU-only exception for Spitzli’s own GitHub CI. The official managed-builder probe passed with `nofallback: true`. These prepared workflows use only Blacksmith; actual per-repository source checks and publication of the regular workflows remain pending. Provider and customer credentials are not used for source checks, and no builder fallback is allowed.

The prepared manual `Plugin Blacksmith build` workflow can push a checked image candidate by enabling `publish_image`. It records the immutable image/source identity; existing versioned registry manifests and releases are unchanged. A new registry version still requires its proper manifest and signed integrity verification.
