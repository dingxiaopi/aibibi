# Deployment

The website runs on Cloudflare Workers with D1 and bundled static assets.
Collection runs on your own macOS/Linux computer or server. No Supabase, queue,
paid AI service or permanently running web server is required to try the demo.

## Demo

```sh
cd cloudflare
npm ci
npm run demo
```

The command applies local migrations, seeds fictitious stores, builds the frontend
and starts port 8787. Use `npm run demo -- --port 8790` for a different port, or
`npm run demo -- --prepare-only` to validate setup without keeping a server open.
It uses `wrangler.demo.jsonc` and `.local/demo-d1` under `cloudflare/`; production
configuration and the ordinary local database are not used.
The banner marks all offers as examples, analytics is off, and demo pages are
noindex. Demo initialization refreshes only its own synthetic fixture rows.

## Your own instance

From the root, create `.local/` and copy the site and collector configuration
examples there as described in `configuration.md`. Initialize your source list.
Then prepare your own Cloudflare resources using the commands below. These are
manual deployment instructions, not commands executed by CI.

```sh
cd cloudflare
npm ci
npm run wrangler -- login
npm run wrangler -- d1 create aibibi
```

Copy `wrangler.jsonc` to `wrangler.local.jsonc`; set your Worker name, D1 database
name and the returned D1 ID. The all-zero ID in the public defaults is only a
placeholder for local development. Keep the D1 binding named `DB`. If using a
custom domain, add its route and set the same origin in your site configuration.

For local development:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

`db:seed` imports the current instance snapshot without refreshing its timestamps.
It preserves existing rows; normal updates use the authenticated transfer path.
Keep a local `.dev.vars` with separate administrator and collector credentials.

For production, review the target config, then run:

```sh
npm run check
npm test
npm run build
npm run wrangler -- d1 migrations apply DB --remote
npm run wrangler -- secret put ADMIN_PASSWORD
npm run wrangler -- secret put COLLECTOR_INGEST_TOKEN
npm run deploy
```

Secrets are entered interactively; do not put their values in command arguments.
Then point the collector at your instance and push actual observations. Recheck
public pages and APIs, source timestamps and administrator authentication.

The npm wrapper chooses an explicit `BIJIA_WRANGLER_CONFIG`, then the ignored local
Wrangler config if present, otherwise generic defaults. It regenerates shared
site settings before invoking Wrangler. CI does not create resources, collect
live stores or deploy production.

## Data updates versus code releases

Price updates run collection and push data; no Worker deployment is needed.
Code or site-configuration changes require a new frontend/Worker build and deploy.
Public data caches can delay visibility; a successful collection alone is not
proof that every transfer batch was received.
