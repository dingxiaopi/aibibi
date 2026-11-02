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

## 反馈与提交入口

- 安装或功能错误：使用 [问题反馈](https://github.com/dingxiaopi/aibibi/issues/new?template=bug_report.yml)。
- 原店解析：使用 [采集器适配](https://github.com/dingxiaopi/aibibi/issues/new?template=collector_adapter.yml)。
- 新场景与改进：使用 [功能建议](https://github.com/dingxiaopi/aibibi/issues/new?template=feature_request.yml)。
- 不确定原因时，先查看 [常见问题](public-docs/troubleshooting.md)。

提交 PR 时说明问题、改动后的行为和实际执行的验证。涉及实例数据或协议变更时，
说明兼容处理；新适配器需要给出脱敏样本和未支持的情况。
贡献代码不会自动把来源或报价加入任何生产实例。
