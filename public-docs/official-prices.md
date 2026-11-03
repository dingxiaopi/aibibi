# 官方地区价格与手动更新

官方价页面按当前选择的套餐展示，每个地区一行，并排比较 App Store 与官网直购。
筛选和排序使用项目已有的 shadcn/ui 组件。价格排序按人民币折算，支持 App Store、
官网含税、官网未税与税费未明确的标价；缺价和过期记录放在最后。

## 来源与税费

| 来源 | 读取方式 | 边界 |
| --- | --- | --- |
| App Store | 对应国家商品页内的 `addOns`，校验 storefront、应用 ID、套餐名称与周期 | 仅公开列出的内购项目；税费口径未明确时显示标价 |
| ChatGPT 官网 | `https://chatgpt.com/backend-api/checkout_pricing_config/configs/{国家代码}` | 核对国家、实际计费币种与月付档位；可能返回 403/429 |
| Gemini 官网 | 从 Google One 当前官方页面及其脚本发现 `pricing_YYYY_MM_DD.json`，再读取各地区官方 feed | 不固定历史版本；税费口径未明确时显示标价 |
| Google Play | 尚未接入可靠的分地区订阅套餐来源 | 商品页的价格区间不能当作具体套餐订阅价 |

只展示来源明确给出的税费金额。例如菲律宾 ChatGPT Plus 官网响应同时给出含税价
PHP 1,100 与未税价 PHP 982.14；App Store 的 PHP 999 是另一渠道报价。
未明确提供的含税价或未税价显示缺失，不用税率倒算。年付金额也不从月付推算。
Google 官网 Ultra 5x/20x 与 App Store 泛称 Ultra 分开建档，不假定为同一套餐。

每条记录保存原始来源、观察时间、最近尝试时间、渠道、币种和税费口径。
刷新失败时保留旧记录并标记失效；超过七天的报价也不参与最低价及价格排序。
汇率来自 ExchangeRate-API 的公开 USD 汇率，折算金额仅作比较。

## 本地更新

```sh
# App Store 四个应用
python3 -m collector.official_prices --channels ios
# Gemini 官网
python3 -m collector.official_prices --channels web --apps gemini
# ChatGPT 官网，先检查两个地区
python3 -m collector.official_prices --channels web --apps chatgpt --regions us,ph --dry-run
```

普通请求返回 403/429 时，本轮停止后续未捕获地区的 OpenAI 请求，不绕过访问限制。
`--web-evidence` 可读取操作者从官方浏览器响应保存的 JSON 列表，每项为
`source_url`、`observed_at`、`data`；仅接受匹配的官方 URL、带时区且七天内的时间。
这是受信任的本地导入格式，不是来源真实性的密码学证明，不接受竞品数据。

底层 CLI 允许保留失败来源，因此退出码不能单独证明本轮采集覆盖率。
需要覆盖率检查时使用下面的 Actions 入口。

## GitHub 手动采集

将 [`ops/github-actions/official-prices.yml`](../ops/github-actions/official-prices.yml)
复制到自己的**私有状态仓库** `.github/workflows/official-prices.yml`，放在默认 `main` 分支。
配置仓库变量：

- `APP_REPOSITORY`：公开代码仓库，如 `dingxiaopi/aibibi`。
- `OFFICIAL_APP_REF`：已审核代码的完整 40 位提交 SHA。与店铺采集的 `APP_REF` 分开维护。

该工作流不需要新密钥，不读取店铺密文或网站写入令牌。使用 GitHub 托管的 Ubuntu
运行器，只有手动 `workflow_dispatch` 入口，并与店铺采集共用串行队列。
公共仓库的 Quality CI 始终使用固定样本，不执行真实采集。

在私有仓库 Actions → **Official prices** → **Run workflow** 中选择：

| 参数 | 选项与行为 |
| --- | --- |
| `source` | `supported`：四个应用的 App Store + Gemini 官网；`ios` / `gemini` 可单独采集；`chatgpt` 单独检查 OpenAI 官网 |
| `mode` | `probe`：检查并保存诊断附件，不更新持久快照；`collect`：检查通过后保存私有快照 |
| `regions` | 可填 `us,ph` 等已登记地区；留空时 probe 读取美国/菲律宾，collect 读取全部 14 个地区 |

**每个选中的应用/渠道必须有至少 80% 地区取得本轮的新鲜有效价格**。
旧记录、失败记录、未请求的渠道和仅有缺价的响应不能凑成功数。
失败则任务标红，持久快照不被替换；候选快照和报告保留为 30 天的诊断附件。
即使通过门槛，个别失败地区仍保留旧时间并标记失效，不视作成功。

通过的 `collect` 将 `official-prices/snapshot.json` 与 `report.json` 保存到私有仓库。
后续运行以该快照为基底，只替换指定范围；未请求的渠道保留自己的观察时间。

## 采集后如何展示到网站

网站当前从 `cloudflare/shared/official-prices.json` 在构建时加载官方价。
**GitHub 采集成功只更新私有数据，不会自动改变已部署网站。**
审核采集报告后，将接受的快照复制到上述路径，运行类型检查、测试和构建，再按
[部署流程](deployment.md)发布。工作流没有网站部署、D1 写入或定时任务。
