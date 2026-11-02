# 从零运行到第一条真实报价

本教程面向第一次安装 aibibi 的运营者：先启动本地网站，再登记自己的原店，阅读商品详情、批准一条规格映射，最后把真实报价推送到本地网站。跑通后再部署自己的 Cloudflare 实例，并选择是否接入私有 GitHub Actions。

代码和通用规格已开源。真实店铺清单、报价、审核映射、生产凭据和采集节点由每位运营者自己准备；Fork 不会获得原运营站的数据或服务器。

## 1. 安装并试用演示

使用 macOS 或 Linux、Node.js 22.18+、Python 3.9+。后续加密的 Actions 状态工具另需 Python 3.11。

```sh
git clone --branch v0.3.0 https://github.com/dingxiaopi/aibibi.git
cd aibibi/cloudflare
npm ci
npm run demo
```

打开 `http://127.0.0.1:8787`。演示使用虚构报价和独立本地数据库，不需要登录 Cloudflare 或配置 AI。确认能打开后，按 Ctrl+C 停止演示。以下步骤从仓库根目录 `aibibi/` 执行；如果仍在 `cloudflare/`，先执行 `cd ..`。

## 2. 创建自己的空实例

以下复制命令仅用于全新克隆，还没有自己的配置时执行：

```sh
mkdir -p .local
cp config/site.json .local/site.json
cp config/collector.example.json .local/collector.json
cp config/sources.example.json .local/sources.json
```

编辑 `.local/site.json` 的站点名称；先保持 `url` 为 `http://127.0.0.1:8787`、`demo` 为 `false`，统计配置留空。`.local/collector.json` 的 `url` 同样保持本地地址。

编辑 `.local/sources.json`，只保留一家自己决定收录的、公开且受现有适配器支持的原店，填入真实身份并显式启用。下面仅是结构示例，不能把占位值当真实来源：

```json
{
  "shop_limit": 200,
  "shops": [
    {"id": "S_REPLACE_WITH_REAL_ID", "platform": "16688", "enabled": true}
  ]
}
```

16688 的 `id` 使用原店实际的 `S...` 编号；wzyp/catfk 还需原店 URL 的公开路径标识 `source_token`；acg 需 HTTPS `origin`，其商城格式也必须受适配器支持。字段说明见[实例配置](configuration.md)。不从其他比价网站导入清单、映射或报价。

初始化并创建仅用于这个本地实例的凭据：

```sh
python3 -m collector.init_instance --sources .local/sources.json
python3 - <<'PYTHON'
import os
import secrets
from pathlib import Path

path = Path('cloudflare/.dev.vars')
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as file:
    file.write('ADMIN_PASSWORD=' + secrets.token_urlsafe(32) + '\n')
    file.write('COLLECTOR_INGEST_TOKEN=' + secrets.token_urlsafe(32) + '\n')
print('Created local credentials; values were not printed.')
PYTHON
```

初始化生成 `.local/data/seeds.json` 和空快照，映射从零开始；重复初始化或重复生成凭据会拒绝覆盖。之后修改 `.local/sources.json` 不会自动合并到实例，需要在 `seeds.json` 中管理来源。不要提交 `.local/` 或 `.dev.vars`。

## 3. 启动自己的本地网站

```sh
cd cloudflare
npm run db:migrate
npm run db:seed
npm run dev
```

保持这个终端运行，在另一个终端进入同一仓库根目录。打开 `http://127.0.0.1:8787`，此时规格可以显示，但没有真实报价是正常的。这里使用普通本地 D1，与前面的 demo 数据库分开，也不会创建线上资源。

## 4. 首次采集货架

在另一个终端的仓库根目录运行：

```sh
python3 -m collector.update --dry-run
python3 - <<'PYTHON'
import json
from pathlib import Path

snapshot = json.loads(Path('.local/data/snapshot.json').read_text())
print(snapshot['stats'])
PYTHON
```

`--dry-run` 会真实访问原店、写入本地快照和导出包，但不运行 AI、不向网站同步或推送。应先确认 `shops_ok` 大于零，再继续。刚初始化时 `ready_quotes` 为零、商品进入 `review_items` 是正常的：采到商品不等于已经审核。

遇到验证码、登录或 WAF 应停止并检查来源和运行节点；不绕过访问控制。wzyp 每次请求至少间隔 5 秒，大货架需要更久。

## 5. 审核第一件商品

本节先走人工审核路径，不需要 AI Key。将下面命令中的 `YOUR_SHOP_ID`、`YOUR_GOODS_ID` 换为自己快照中的真实 ID：

```sh
python3 -m collector.review list --shop YOUR_SHOP_ID
python3 -m collector.review inspect YOUR_SHOP_ID YOUR_GOODS_ID
```

`inspect` 会重新读取原店完整详情，打印审核草稿路径。用本地编辑器打开该 JSON，完整阅读 `raw.name`、`raw.description` 与售后条件，然后只填写 `mapping` 的五项：

| 字段 | 填写依据 |
| --- | --- |
| `sku` | `.local/data/seeds.json` 中 `products[].id` 的精确规格 ID |
| `channel` | 商品实际交付渠道或账号类型 |
| `warranty` | 原店明确写出的质保、退款或售后条款；未说明则明确写未说明 |
| `spec_evidence` | 为什么能归入该规格，包括套餐、实际订阅时长等原文依据 |
| `restriction` | 地区、账号、充值前提等限制；未说明则明确写未说明 |

信息不足时保持未批准，不按标题猜测。月度规格必须有实际订阅时长依据，质保天数、账号年龄不能代替。若通用规格中没有准确对应的项，先补充自己的规格定义并复核，不勉强归类。不要修改草稿的原始详情、指纹、身份或观察时间。

填写后，用 `inspect` 实际打印的路径批准：

```sh
python3 -m collector.review approve .local/data/runtime/reviews/YOUR_SHOP_ID--YOUR_GOODS_ID.json
```

批准会再次请求原店，核对店铺/商品身份、完整说明指纹、规格与库存。原说明变化、缺少订阅时长依据或其他校验失败时不会保存映射；修正原因后重新 inspect 和审核，不强行修改指纹。

也可配置[自己的 AI 服务或 Codex CLI](configuration.md#credentials-and-ai)，然后从仓库根目录运行：

```sh
python3 -m collector.classification --plan --shop YOUR_SHOP_ID
python3 -m collector.classification --shop YOUR_SHOP_ID
```

`--plan` 只显示候选计划，实际分类命令会访问来源并调用所配 AI，可能产生供应商费用。完成后检查 `approved`、`pending` 和快照，AI 没有批准商品也不代表获得了可比价报价。首次分类会固定候选范围；已完成店铺后续新增商品仍待审。人工批准一件商品不等于完成整家店的首次 AI 分类；只想沿用已有映射时，后续明确使用 `--no-ai`。

## 6. 更新并推送到本地网站

保持本地网站运行，从仓库根目录执行：

```sh
python3 -m collector.update --no-ai --min-success-ratio 0.8
```

它会同步本地网站的暂停/排除状态、重新采集价格与库存、导出并分批推送。令牌从这个实例的 `cloudflare/.dev.vars` 读取。采集失败或成功率不足时，不降低门槛来获得表面成功。

验收需要同时满足：

1. 采集结果中目标店铺成功，商品有已审核映射。
2. `.local/data/collection/push-progress.json` 显示 `status=complete`、`done=total`；推送输出报告接收成功。
3. 使用同一采集令牌访问 `/api/collector/transfers?id=<push-progress中的id>`，服务器也返回 `status=complete`、`done_batches=total_batches`。下面的本地脚本只输出批次数，不输出令牌。
4. 刷新网站，或访问 `/api/products?verify=一次性值`、`/api/shops?verify=一次性值`；核对价格、原店链接、库存和真实观察时间。查询参数用于避开之前的公开缓存。

从仓库根目录核对服务端回执：

```sh
python3 - <<'PYTHON'
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from collector.paths import STATE_DIR, TARGET_URL

values = {}
for line in Path('cloudflare/.dev.vars').read_text().splitlines():
    key, separator, value = line.partition('=')
    if separator and not key.strip().startswith('#'):
        values[key.strip()] = value.strip().strip('\"\'')
token = (os.environ.get('BIJIA_INGEST_TOKEN') or
         os.environ.get('COLLECTOR_INGEST_TOKEN') or values['COLLECTOR_INGEST_TOKEN'])
progress = json.loads((STATE_DIR / 'push-progress.json').read_text())
assert progress['endpoint'] == TARGET_URL.rstrip('/')
assert progress['status'] == 'complete' and progress['done'] == progress['total']
request = Request(TARGET_URL.rstrip('/') + '/api/collector/transfers?id=' + progress['id'],
                  headers={'Authorization': 'Bearer ' + token})
with urlopen(request, timeout=30) as response:
    receipt = json.load(response)
assert receipt['status'] == 'complete'
assert receipt['done_batches'] == receipt['total_batches'] == progress['total']
print({'status': receipt['status'], 'batches': receipt['done_batches']})
PYTHON
```

该脚本使用已配置的目标；若上一条 update 临时使用了 `--url`，先把 `.local/collector.json` 的目标改为同一 origin，不能把本地回执误算作线上验收。只有报价有效、在架、明确有货、可立即使用且未过期时，才进入当前有货最低价。批准成功但缺货时，不能为了演示最低价而改库存或时间。此时继续审核另一件符合条件的真实商品，或保留无价状态。

## 7. 部署自己的线上实例

完成本地闭环后，按[部署说明](deployment.md#your-own-instance)建立自己的 Worker 和 D1、应用迁移、设置独立的线上管理员密码和采集令牌，再部署代码。将站点 `url` 和采集目标改成自己的同一 HTTPS origin；可先用自己的 workers.dev 地址，不要求先买域名。

修改站点地址后需要重建并部署网站。向新目标首次推送前，保存旧实例数据和进度；确认本地任务已完成，再用明确的新目标开始一轮：

```sh
python3 -m collector.update --no-ai --min-success-ratio 0.8 --url https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev
```

为线上目标使用与该 Worker 匹配的采集令牌。不要把本地导出包或未完成任务改个 URL 就续传；目标、摘要与服务端批次必须匹配。线上重新核对服务器回执、公开报价和后台鉴权。

## 8. 可选：交给私有 Actions 或自己的 VPS

本地首次审核并推送通过后，按[GitHub Actions 说明](github-actions.md)建立自己的私有状态仓库，准备独立密钥、已审核 profile、Variables 和 Secrets，固定已审核代码的完整 SHA。

| 选择 | 条件 |
| --- | --- |
| GitHub 托管 runner | 先用少量来源 probe 验证原店可达性 |
| 自托管 VPS | 自己的节点、专用用户与标签，只注册到私有状态仓库 |
| hosted/vps 分组 | 来源组不重叠，独立密文、共享串行队列 |

Actions 固定 `--no-ai`，不会替新实例完成首次分类；先 probe、小范围 update 并核对回执，再扩大范围。probe 仍会访问原店；sample 也需要单独准备，不会自动抽样。profile 必须事先存在对应密文，不能仅在界面选择一个名字就运行。

工作流只有手动触发，没有安装定时器。自托管节点成功保存密文后才清理明文；若保留了未保存数据，下次检出前会停止，先恢复或核实远程密文再清理。各 profile 独立，旧样本不能覆盖正式组的新数据。切回本机前停止其他任务并恢复权威状态。

## 出错时从哪里继续

- 本地采集或推送中断：先看 `.local/data/collection/update-state.json` 与检查点；使用原目标、原 dry-run 模式加 `--resume`。
- 成功率不足：先排查来源/网络；已采完的失败快照不会因 resume 自动重新采集，需要明确 `--restart` 才开启新一轮。
- 401：检查当前目标与令牌是否匹配。
- 409：核对审核映射或后台状态冲突，不反复强推旧包。
- GitHub 检出失败：尚未开始店铺采集；恢复仓库连接后再重跑。
- VPS 密文上传失败：明文保留，先核对/恢复已加密状态，再清理并恢复任务。

更多诊断见[常见问题](troubleshooting.md)。反馈只提供版本、步骤和脱敏摘要，不上传实例目录、审核草稿或密钥。
