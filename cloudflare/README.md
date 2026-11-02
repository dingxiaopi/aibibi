# aibibi website and Worker

Start with the root [README](../README.md).

```sh
npm ci
npm run demo
```

- `web/`: React frontend; Vite emits `public/`.
- `src/`: Worker routes, SSR, validation and D1 repositories.
- `shared/`: common rules and transfer contracts.
- `migrations/`: immutable D1 migrations.
- `scripts/`: instance configuration, local import/export and demo tools.

See [configuration](../public-docs/configuration.md),
[deployment](../public-docs/deployment.md) and
[collector contributions](../public-docs/collectors.md).

`npm run dev` starts the ordinary local instance; `npm run demo` uses its own
fictitious database and demo settings. Use npm scripts so Worker and frontend
receive the same prepared site configuration. Never commit local overrides.
