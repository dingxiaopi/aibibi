# Preparing the first GitHub publication

Use a fresh source export for a repository that previously contained production
data. `.gitignore` does not remove data from historical Git commits.

```sh
python3 scripts/export_public.py --output /absolute/path/aibibi-public
```

The exporter uses an allowlist, refuses existing destinations and excludes Git
history, instance configuration, real seeds/snapshots, legacy static output,
credentials, raw captures, internal handoffs and build products. It includes
public docs, synthetic demo code, starter specifications and existing third-party
license notices. It does not create a Git repository, commit or upload anything.

Before publication, verify the exported tree, install and run its checks and demo,
and review the MIT license plus separate data and trademark notices. A fresh
export avoids publishing the old repository's history; it is not a forensic
audit of every historical secret. Rotate any credential known to have leaked.

Create a new GitHub repository named `aibibi` only after reviewing that exact
export. Do not push the original private repository history by accident.
