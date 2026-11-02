# 用 GitHub Actions 手动采集

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

工作流只有 `workflow_dispatch`，不接受 PR 触发，也没有定时器。它固定使用 `--no-ai`，
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
| `COLLECTOR_RUNNER_LABELS` | 可选 JSON 数组；默认 `["ubuntu-latest"]`。专用自托管节点可设为 `["self-hosted","aibibi-collector"]` |

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

```sh
python3.11 -m pip install -r ops/github-actions/requirements.txt
python3.11 -m collector.actions_state prepare \
  --directory /private/path/to/instance-data \
  --archive /private/path/to/state-repo/profiles/production.bin \
  --profile production \
  --target https://your-instance.example
```

上面的命令从环境变量读取 `COLLECTOR_STATE_KEY`，只创建新 archive，不修改源数据或覆盖旧 archive。
将生成的 `profiles/production.bin` 提交到私有仓库，明文目录、密钥和凭据不要提交。

`sample` profile 需要用独立的少量店铺数据建立；它不会自动从 production 随机抽样。
两个 profile 的密文绑定各自身份，不能通过互换文件名冒充对方。

## 手动运行

在私有仓库 Actions 中打开 **Collect prices → Run workflow**，选择：

| 输入 | 含义 |
| --- | --- |
| `profile=sample` | 独立的少量店铺试跑状态 |
| `profile=production` | 完整来源和审核映射 |
| `mode=probe` | 实际访问原店、采集并保存状态，不推送线上 |
| `mode=update` | 同步、采集、导出、推送 |
| `mode=resume` | 继续未完成任务；原来是 probe 就仍然不推送 |
| `mode=restart` | 明确放弃未完成进度，重新采集并推送；旧密文仍在私有 Git 历史中 |

第一次先 sample + probe，再 sample + update；确认 runner 的原店访问能力和推送结果后，
再运行 production + update。遇到验证码、登录墙、WAF 或源站限制时，不绕过。

托管 runner 的网络访问能力必须实际验证；本机能读取的来源，不保证 GitHub 的机器也能读取。
例如 2026-11-02 的验证中，wzyp 在托管 runner 返回验证页，而同一来源在原本机可以正常读取。
这种情况需要使用能正常访问原店的专用采集节点，或明确限定托管 runner 的采集范围，不能降低门槛后盲目推送。
自托管 runner 应注册在私有运行仓库，使用专用标签，保持工作流仅手动触发并固定采集代码提交。

## 失败与状态

- 工作流串行运行，不取消正在执行的上一轮任务。
- 活跃来源成功率低于 80% 时停止导出/推送，避免 runner 网络故障大面积影响公开报价。
  若任务已完成采集但被门槛阻止，排查后用 restart 重新采集；resume 会保留原快照与检查。
- 网络推送中断后用 resume，导出包摘要与服务器批次回执仍会验证。
- 正常失败会保存检查点和私有诊断；runner 被强制终止或平台不可用时，不能保证保存最后一刻进度。
- 打包历史库时保留全部真实价格观察，只保留最新一份完整快照，避免重复快照持续膨胀。
  压缩在临时副本中进行，不修改本机原历史库。
- 状态解密失败会停止，且不会将空目录重新加密覆盖原状态。
- 工作流日志和 Summary 只输出数量、阶段、时间和推送进度，不输出原店身份与描述。
  详细诊断保存在加密状态中，不作为普通 artifact 上传。

私有状态仓库应作为 Actions 采集的权威状态。切回本机运行前，先停止其他任务、恢复最新状态，
不要让本机旧快照与云端采集同时写入。云端采集不自动回写自己电脑上的历史备份。
