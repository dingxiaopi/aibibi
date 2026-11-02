# Configuration

Paths are resolved relative to the repository root, consistently in Python and Node.
Supported collector hosts are macOS and Linux, with Python 3.9+ and Node.js 22.18+.
The frontend can be developed without AI credentials.

## Public site

Copy `config/site.json` to `.local/site.json` and customize the name, URL, tagline,
description, local logo/favicon paths and optional redirect hosts. The URL is an
HTTP(S) origin, without a path, query or credentials. `redirectHosts` is an explicit
list of old hosts to redirect to that origin; unknown hosts keep their own origin.

Analytics is disabled unless both `analyticsScript` (HTTPS) and `analyticsId` are
set. Demo mode always disables analytics. Site configuration is public after build.
Use your own logo, domain and production database for an independent deployment.

## Collector

Copy `config/collector.example.json` to `.local/collector.json`. Environment
variables override that file:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BIJIA_DATA_DIR` | `.local/data` | Seeds and snapshot |
| `BIJIA_URL` | `http://127.0.0.1:8787` | Target Worker |
| `BIJIA_RUNTIME_DIR` | `<data>/runtime` | History, drafts, AI results |
| `BIJIA_STATE_DIR` | `<data>/collection` | Checkpoints, state and logs |
| `BIJIA_EXPORT_DIR` | `<data>/exports` | Transfer bundles and import SQL |
| `BIJIA_INSTANCE_CONFIG` | `.local/collector.json` | Alternate collector settings |
| `BIJIA_SITE_CONFIG` | `.local/site.json` | Alternate public site override |
| `BIJIA_WRANGLER_CONFIG` | local Wrangler config if present, otherwise generic | Config path from repository root |
| `BIJIA_PROXY` | system environment | Optional explicit proxy |
| `BIJIA_INGEST_TOKEN` | none | Trusted collector credential |

Explicit `BIJIA_DATA_DIR` isolates history, checkpoints and exports from any legacy
directory overrides in `.local/collector.json`. Override individual directories
explicitly only when intentionally sharing or restoring an existing installation.

## Sources and initialization

Prepare your own JSON with `shops` and optional `shop_limit` (maximum 200).
`config/sources.example.json` contains disabled placeholder examples only.

```sh
python3 -m collector.init_instance --sources .local/sources.json
```

This creates private seeds with the starter catalog, empty mappings and an empty
snapshot. It refuses to overwrite existing data. Later edits to your source JSON
are not automatically merged: manage the instance's `seeds.json` deliberately.
Source discovery accepts only a supplied `--input` list and does not download a
competitor directory.

## Credentials and AI

Use the `.dev.vars.example` names to configure local administrator and collector
credentials; generate different strong values. For a standalone collector,
provide `BIJIA_INGEST_TOKEN` via the environment. The update command accepts
`COLLECTOR_INGEST_TOKEN` too and falls back to local `.dev.vars` for compatibility.

AI review is optional for updating already-classified goods. Set all three
`AI_REVIEW_BASE_URL`, `AI_REVIEW_API_KEY`, `AI_REVIEW_MODEL` through the environment
or the ignored `.env.ai-review` file to use the existing compatible API adapter.
Otherwise the review command uses an installed, configured Codex CLI.
`AI_REVIEW_CLI_MODEL` optionally selects a CLI model; no account-specific model is
hardcoded in the public defaults. The API provider must support the adapter's
structured-output request format. Missing providers do not approve new goods.
