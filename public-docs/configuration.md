# Configuration

Paths are resolved relative to the repository root, consistently in Python and Node.
Supported collector hosts are macOS and Linux, with Python 3.9+ and Node.js 22.18+.
The frontend can be developed without AI credentials.

## 新安装：准备本地配置

以下命令从仓库根目录执行，仅用于还没有实例配置的新安装。已有实例请保留自己的文件。

```sh
mkdir -p .local
cp config/site.json .local/site.json
cp config/collector.example.json .local/collector.json
cp config/sources.example.json .local/sources.json
```

先修改 `.local/site.json` 的站点身份与域名，以及 `.local/collector.json` 的推送目标。
然后编辑 `.local/sources.json`：示例地址和 ID 都是占位内容，默认 `enabled: false`。
替换为自己的原店后，再改为 `enabled: true`。常用来源字段如下：

| 平台 | 必要信息 |
| --- | --- |
| `16688` | `id` 为原店的 `S...` 店铺编号 |
| `wzyp` / `catfk` | 独立的本地店铺 `id` 与原店公开 URL 中的 `source_token` |
| `acg` | 独立的本地店铺 `id` 与 HTTPS 原站 `origin`，还需系统格式受现有解析器支持 |

这里的 `source_token` 是公开店铺路径标识，不是登录凭据或 AI API Key。
确认来源后再运行下面的初始化命令。演示用户可以直接使用 `npm run demo`，无需这些配置。

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

普通本地实例的 `.dev.vars` 可以在 `cloudflare/` 中生成。以下命令只创建新文件，
文件已存在时会停止；生成值写入文件，不在终端显示：

```sh
cd cloudflare
python3 - <<'PYTHON'
import os
import secrets
from pathlib import Path

path = Path('.dev.vars')
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as file:
    file.write('ADMIN_PASSWORD=' + secrets.token_urlsafe(32) + '\n')
    file.write('COLLECTOR_INGEST_TOKEN=' + secrets.token_urlsafe(32) + '\n')
print('Created local credential file; values were not printed.')
PYTHON
```

通过本地编辑器查看并使用管理员密码。线上 Worker 需要分别设置自己的 Secrets，
独立采集器的令牌应与目标实例匹配。不要将本地文件上传到 GitHub。


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
