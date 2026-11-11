# 用 GitHub Actions 采集

新实例先按[从零到第一条真实报价](first-quote.md)完成来源初始化、首次审核与本地/线上推送。
Actions 固定使用 `--no-ai`；未建立商品映射时，采到货架也不会自动产生可比价报价。

公开仓库提供运行代码和 `ops/github-actions/collect.yml` 模板。实际采集工作流安装在
自己的**私有状态仓库**，保存加密后的实例数据。这样不依赖自己的电脑在线，也不用把
店铺清单、审核映射、历史报价或采集令牌提交到公开代码仓库。

## 运行结构

```text
私有仓库：手动 Run workflow
  → 检出已审核并固定提交的公开采集代码
  → 解密本轮 profile 的 seeds、snapshot、历史和检查点
  → 同步线上暂停/排除状态，沿用已有分类采集
  → 达到成功率门槛后，按需分批推送目标实例
  → 无论成功或正常失败，都加密并保存最新状态
```

工作流默认只有 `workflow_dispatch`，不接受 PR 触发；定时运行需要在私有仓库自行开启（见[定时运行](#定时运行)）。它固定使用 `--no-ai`，
不会为新商品调用 AI 或自动批准。更新数据无需部署 Worker。

## 私有仓库配置

在自己的账号建立私有仓库，将模板复制到该仓库的 `.github/workflows/collect.yml`。
公开模板本身放在 `ops/`，不会在公开仓库自动运行。

配置仓库 Variables：

| 名称 | 内容 |
| --- | --- |
| `APP_REPOSITORY` | 自己审核过的公开代码仓库，例如 `owner/aibibi` |
| `APP_REF` | 对应的完整提交 SHA，避免未审核代码自动获得运行凭据 |
| `COLLECTOR_URL` | 自己的 HTTPS Worker origin，必须与加密 profile 的目标一致 |
| `COLLECTOR_RUNNER_LABELS` | 普通 profile 的可选 JSON 标签数组；默认 `["ubuntu-latest"]` |
| `COLLECTOR_VPS_RUNNER_LABELS` | VPS profile 的可选 JSON 标签数组；默认 `["self-hosted","aibibi-vps"]`，不会回退到托管机器 |

配置私有仓库 Secrets：

| 名称 | 内容 |
| --- | --- |
| `COLLECTOR_STATE_KEY` | 随机 32 字节密钥的标准 Base64 编码 |
| `BIJIA_INGEST_TOKEN` | 目标实例已配置的采集令牌 |

密钥应在本地生成、保留私有备份，并通过 stdin 或 GitHub Secrets 页面配置。
不需要管理员密码、个人访问令牌、Cloudflare API Token 或 AI Key。
工作流用本仓库的 `GITHUB_TOKEN` 保存加密文件，权限只作用于这个私有仓库。

## 初始化状态

先在本地准备已经完成分类的实例数据，保留真实采集时间。状态文件格式与普通采集器相同。
加密工具额外使用 Python 3.11 和 `requirements.txt` 中固定的可选依赖，普通本地采集不需要它。

以下命令在代码仓库根目录执行。先准备隔离虚拟环境和本地密钥文件；密钥生成命令只创建新文件，文件已存在时停止，不在终端显示密钥：

```sh
python3.11 -m venv .local/actions-venv
.local/actions-venv/bin/python -m pip install -r ops/github-actions/requirements.txt
.local/actions-venv/bin/python - <<'PYTHON'
import base64
import os
import secrets
from pathlib import Path

path = Path('.local/actions-state.key')
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as file:
    file.write(base64.b64encode(secrets.token_bytes(32)).decode() + '\n')
print('Created private state key; its value was not printed.')
PYTHON
```

把下面 `--directory` 改为自己已审核的实例数据目录，`--archive` 改为自己私有状态仓库中的新文件，
`--target` 改为自己的 Worker origin。子 shell 只在本次命令内加载密钥：

```sh
(
  export COLLECTOR_STATE_KEY="$(cat .local/actions-state.key)"
  .local/actions-venv/bin/python -m collector.actions_state prepare \
    --directory /private/path/to/instance-data \
    --archive /private/path/to/state-repo/profiles/production.bin \
    --profile production \
    --target https://your-instance.example
)
```

`prepare` 从环境变量读取密钥，只创建新 archive，不修改源数据或覆盖旧 archive。
将生成的 `profiles/production.bin` 提交到私有仓库，明文目录、密钥和凭据不要提交。
若使用已登录的 GitHub CLI，可从文件通过 stdin 设置状态仓库的密钥：

```sh
gh secret set COLLECTOR_STATE_KEY --repo YOUR_OWNER/YOUR_PRIVATE_STATE_REPO < .local/actions-state.key
```

`BIJIA_INGEST_TOKEN` 仍在私有仓库 Secrets 页面配置为目标实例的采集令牌。
密钥文件需要单独保留私有备份；运行时 Secrets 和本地 `prepare` 必须使用同一把密钥。

`sample` profile 需要用独立的少量店铺数据建立；它不会自动从 production 随机抽样。
`hosted` 是可选的独立来源子集，供托管 runner 使用；必须由运营者显式选定来源并准备状态。
它不自动检测或移除访问失败的来源，完整 `production` 状态应保留。每个 profile 的密文绑定各自身份，不能通过互换文件名冒充对方。

## 手动运行

在私有仓库 Actions 中打开 **Collect prices → Run workflow**，选择：

| 输入 | 含义 |
| --- | --- |
| `profile=sample` | 独立的少量店铺试跑状态 |
| `profile=hosted` | 运营者显式配置的托管 runner 来源子集 |
| `profile=vps_sample` | 专用 VPS 节点上的独立少量来源试跑 |
| `profile=vps` | 专用 VPS 节点负责的来源组 |
| `profile=production` | 完整来源和审核映射 |
| `mode=probe` | 实际访问原店、采集并保存状态，不推送线上 |
| `mode=update` | 同步、采集、导出、推送 |
| `mode=resume` | 继续未完成任务；原来是 probe 就仍然不推送 |
| `mode=restart` | 明确放弃未完成进度，重新采集并推送；旧密文仍在私有 Git 历史中 |
| `mode=auto` | 有未完成任务就继续，否则同 update；定时运行固定使用这个模式 |

第一次先 sample + probe，再 sample + update；确认 runner 的原店访问能力和推送结果后，
再运行选定范围的 hosted 或 production + update。遇到验证码、登录墙、WAF 或源站限制时，不绕过。

使用子集时，seeds 的店铺、映射、排除记录，以及 snapshot 的店铺、报价和待审记录都应限定在该子集；
不要仅删除店铺配置却保留其他店的旧报价。推送按店铺和报价 ID 更新，不将本轮未包含的店铺视为下架；
未采集来源仍保留原有观察时间，并继续遵守网站的报价时效规则，不能算作本轮更新。
80% 成功率门槛按所选 profile 内的活跃来源计算，不能把子集成功率报告为全站覆盖率。

托管 runner 的网络访问能力必须实际验证；本机能读取的来源，不保证 GitHub 的机器也能读取。
例如 2026-11-02 的验证中，wzyp 在托管 runner 返回验证页，而同一来源在原本机可以正常读取。
这种情况需要使用能正常访问原店的专用采集节点，或明确限定托管 runner 的采集范围，不能降低门槛后盲目推送。
自托管 runner 应注册在私有运行仓库，使用专用标签，并固定采集代码提交。

## 定时运行

手动 update 跑通、确认推送回执后，可以在私有仓库开启定时。模板里的 `schedule` 默认注释掉：

1. 取消 `schedule` 两行 cron 的注释，按需修改时间（UTC，GitHub 可能延迟几分钟到几十分钟）。
2. 添加仓库变量 `COLLECTOR_SCHEDULE`，把每行 cron 原文对应到一个 profile，例如
   `{"0 0 * * *":"hosted","30 1 * * *":"vps"}`。没有对应 profile 的 cron 不会运行。
3. 把 `APP_REF` 更新到包含 `auto` 模式的已审核提交。

定时任务只用 `auto`：上次中断就继续，不会放弃进度，也不会改用 probe 或 restart。
各 profile 共享全局串行锁，但 GitHub 对同一锁最多保留一个排队任务，新的排队会取消旧的。
因此不同 profile 的时间要错开，间隔大于前一组的运行时长。
网站报价默认 168 小时后失效，采集间隔应明显短于这个时限。
私有仓库 60 天没有提交时 GitHub 会停用定时任务；每次保存密文都会产生提交，正常运行不会触发。
GitHub 托管 runner 在私有仓库计入每月免费分钟数，自托管 runner 不计。

## 按来源分配运行节点

`hosted` 和 `vps` 应包含互不重叠的店铺、映射、排除记录和快照；它们共享私有仓库的全局串行锁，
分别保存独立密文。先 `vps_sample + probe`，再做小范围 update 并验证服务器回执，最后更新 vps 正式范围。
公开仓库的 PR 和 Quality 检查不使用自托管节点，也不接触运营凭据。

VPS runner 只注册到自己的私有状态仓库，使用专用标签和无 sudo/docker 权限的运行用户。
默认标签为 self-hosted、aibibi-vps，GitHub 自带的 Linux/X64 标签也会保留。
按照 [GitHub 官方步骤](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)
安装并注册官方 runner；使用专用工作目录、0077 umask、合理内存/CPU限制，配置 runsvc.sh 对应的服务。
服务常驻监听任务不等于定时采集；是否定时由私有仓库的 `schedule` 和 `COLLECTOR_SCHEDULE` 决定。

VPS 会保留工作目录。工作流在成功保存密文到私有 Git 后才移除解密数据；
若解密/加密或 Git 保存中断而留下 app/.local/data，下次任务在 checkout 之前停止，避免清理时丢失未保存进度。
需要先在 VPS 上检查旧工作目录和私有仓库回执，恢复未保存数据或确认已加密保存，再移走该目录后重新运行。
不要在未核对状态时直接删除它。

## 失败与状态

- 工作流串行运行，不取消正在执行的上一轮任务。开始执行时从私有 main 检出最新密文，
  避免排队期间上一轮保存的检查点被旧触发提交覆盖。
- 活跃来源成功率低于 80% 时停止导出/推送，避免 runner 网络故障大面积影响公开报价。
  若任务已完成采集但被门槛阻止，排查后用 restart 重新采集；resume 会保留原快照与检查。
- 已确认下架的带时间报价保留在后续快照中，即使 probe 已停用该商品监控，
  后续 update 仍会将下架状态送到服务器，不会刷新原观察时间或继续请求商品详情。
- 网络推送中断后用 resume，导出包摘要与服务器批次回执仍会验证。
- 正常失败会保存检查点和私有诊断；runner 被强制终止或平台不可用时，不能保证保存最后一刻进度。
- 打包历史库时保留全部真实价格观察，只保留最新一份完整快照，避免重复快照持续膨胀。
  压缩在临时副本中进行，不修改本机原历史库。
- 状态解密失败会停止，且不会将空目录重新加密覆盖原状态。
- 工作流日志和 Summary 只输出数量、阶段、时间和推送进度，不输出原店身份与描述。
  详细诊断保存在加密状态中，不作为普通 artifact 上传。

每个 profile 独立保存状态。有重叠店铺的 sample/hosted/production 不能视为自动同步的副本；
重新试跑样本前，应从日常 profile 的最新数据派生，不要用旧样本写回更新后的实例。

私有状态仓库应作为 Actions 采集的权威状态。切回本机运行前，先停止其他任务、恢复最新状态，
不要让本机旧快照与云端采集同时写入。云端采集不自动回写自己电脑上的历史备份。

密文提交后的 Git 上传最多重试 5 次，使用 HTTP/1.1；重复推送同一个提交不会重复采集或更改观察时间。
若上传最终失败，任务失败且 VPS 明文保留，下次任务会在检出前停止。先取回 VPS 上已生成的密文，
验证 profile 和结果并提交私有仓库，核对远程文件摘要一致后，才可清理对应明文并启动下一轮。

VPS profile 使用节点本地的 npm 缓存，不再上传/下载 GitHub Actions 的远程 npm 缓存；
托管 runner 仍使用远程缓存。`npm ci` 继续严格按 lockfile 安装。

## 官方地区价

App Store 与官网地区价使用独立的 [Official prices 工作流](official-prices.md)，
不读取店铺状态、不部署网站代码；可选每日定时，并把通过门槛的快照推送到网站数据。
普通店铺采集的配置和范围保持独立。
