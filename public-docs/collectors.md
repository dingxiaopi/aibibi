# Collecting and adding adapters

首次采集没有报价时，先完成[第一条真实报价教程](first-quote.md)中的详情审核与规格映射。人工审核可不配置 AI。

## Run an instance

After initialization, run these from the repository root:

```sh
python3 -m collector.update --dry-run
python3 -m collector.update --no-ai --url http://127.0.0.1:8787
python3 -m collector.update --resume
```

`--dry-run` still performs original-store collection and creates an export, but
skips remote synchronization, AI calls and pushing. It is not a no-network test.
`--no-ai` updates approved mappings without classifying new shops.
Normal update synchronizes backend exclusions, collects, classifies eligible
first-time shops, exports, and pushes. Configure credentials before using it.
Resumption must use the same destination and dry-run mode; changed bundles cannot
reuse an old transfer plan. Use `--restart` only to intentionally abandon progress.

Independent commands remain available:

```sh
python3 -m collector.collect
python3 -m collector.classification --plan
python3 -m collector.review --help
cd cloudflare
npm run export:local
npm run sync:local
npm run push:local
```

The standalone Node sync/push commands require `BIJIA_URL` and
`BIJIA_INGEST_TOKEN` in the environment. The orchestrated Python update sets them.

## Adapter contract

Existing adapters live in `collector/` (16688, wzyp, catfk, acg and supported
independent storefront formats). Source selection uses each configured shop's
platform and identity. Follow their existing shelf/detail observer interfaces:

1. Preserve shop and goods identity. IDs are scoped to the source shop.
2. Return original title, description, source URL, price, inventory status and
   observation time. Inventory can be unknown; do not invent a stock count.
3. Report whether the shelf is complete. Only a complete successful shelf can
   establish disappearance. Network errors do not establish closure or zero stock.
4. Use the shared normalization and approval path. Never approve a SKU from its
   title alone or bypass the source-detail fingerprint check.
5. Respect existing platform delays and public access boundaries. Do not bypass
   logins, CAPTCHAs or WAFs.
6. Add sanitized fixture tests for parsing, incomplete shelves and failure cases.
   Default tests must not send requests to real stores.

The first release keeps the existing adapter functions instead of introducing a
dynamic plugin loader. Schema fields, quote eligibility and source identity are
the compatibility contract; adapter internals can evolve independently.

## Transfer protocol

Current exports use `schema_version: 1`, `transfer_format: 2`. Registration hashes
the batch plan; ingestion uses batch index and server receipts for resumption.
Definitions and mappings precede dependent quotes. Keep actual observation times,
destination, previous fingerprints and moderation conflict checks intact.
Never downgrade an export or rewrite its content while resuming it.
