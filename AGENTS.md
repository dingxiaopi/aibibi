# aibibi contributor instructions

- Read `README.md` and `public-docs/architecture.md` first.
- Keep site configuration, private instance data and source code separate.
- Do not expose `.local`, credentials, captures or actual operator datasets.
- Collect only allowlisted original public or authorized stores. Do not import
  competitor inventories, mappings, source lists or quotes.
- Preserve original observation times and review fingerprints. Do not approve
  products using title heuristics alone.
- Existing database migrations are immutable. Add new migrations when needed.
- Use the existing shadcn/ui components for interactive UI controls.
- Use fixed fixtures and isolated databases in tests; no live collection in CI.
- Collection is manual by default. Do not add scheduled production jobs implicitly.
- Run Python tests, Worker tests, type checking and build for relevant changes.
- Deployment and publication are separate from local development; inspect the
  selected instance configuration before performing either.
