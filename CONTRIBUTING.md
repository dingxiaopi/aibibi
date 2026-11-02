# Contributing

Use issues and pull requests for fixes, new adapters, UI improvements and docs.
Contributions to the project's own code are made under the repository's MIT license.
Preserve all existing third-party notices.

1. Start with the demo in `README.md`; no production secrets or live collection
   are needed for development.
2. Keep source parsing separate from classification and quote eligibility.
   Follow `public-docs/collectors.md` for adapter requirements.
3. Use sanitized or synthetic fixtures. Do not commit actual shop inventories,
   credentials, customer feedback, raw captures or competitor data.
4. Run the checks below. Explain the change and relevant validation in the PR.

```sh
python3 -m unittest discover -s tests
cd cloudflare
npm ci
npm run check
npm test
npm run build
```

Existing database migrations are immutable. Add a migration when a schema change
is necessary; do not drop historical data as part of a routine update.
No CI job performs live shop collection or automatic production deployment.
