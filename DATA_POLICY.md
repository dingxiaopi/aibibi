# Data and instance boundaries

- Source code, public configuration examples, the starter specification catalog
  and synthetic demonstration fixtures are included in this repository.
- Actual shop lists, review mappings, exclusions, collected descriptions, price
  history, feedback and database backups are instance data. The public export
  does not contain the operator's production dataset.
- The bundled official-price reference is a dated collection of observations
  with source links, not a live quotation. Third-party names and source material
  retain their original rights. Verify prices with the original provider.
- A code contribution is not a production data submission. Each operator chooses
  sources and controls which observations and classifications it publishes.
- Collect only public or authorized original-store data. Do not use competitor
  datasets, bypass access controls or present sample values as observed prices.
- Preserve actual observation times. Collection failures do not establish that
  a shop or product is out of stock. Expired, unreviewed and unknown-stock offers
  must not become a current in-stock minimum.
- First classification verifies original details. Later observations reuse the
  approved identity and mapping; key title changes suspend comparison. This does
  not guarantee detection of every later change in description or after-sales terms.
- Demo data is visibly marked, uses fictitious `.example` stores, and runs in a
  separate local database. It must not be exported as a production collection.

Self-hosted instances operate their own data and should publish their own data
and privacy policies. No connection to the original operator's database is needed.
