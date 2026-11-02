import { instancePaths } from "./lib/instance.mjs";
const instance = instancePaths();
import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  appendFileSync,
} from "node:fs";
import { pushBundle } from "../shared/transfer-plan.mjs";
import { transferSender } from "../shared/push-transport.mjs";

const source = process.argv[2] || instance.bundle;
const endpoint = (process.env.BIJIA_URL || "").replace(/\/$/, "");
const token = process.env.BIJIA_INGEST_TOKEN || "";
if (!endpoint || token.length < 24) {
  console.error("请设置 BIJIA_URL 和至少24位的 BIJIA_INGEST_TOKEN");
  process.exit(2);
}
let lastState;
const saveProgress = (state) => {
  lastState = state;
  writeFileSync(`${instance.state}/push-progress.json.tmp`, JSON.stringify(state));
  renameSync(
    `${instance.state}/push-progress.json.tmp`,
    `${instance.state}/push-progress.json`,
  );
};
try {
  const bundle = JSON.parse(readFileSync(source, "utf8"));
  if (bundle.destination && bundle.destination !== endpoint)
    throw Error(
      "采集包按其他站点状态导出，请针对当前 BIJIA_URL 同步并重新导出",
    );
  mkdirSync(instance.state, { recursive: true });
  saveProgress({
    at: new Date().toISOString(),
    endpoint,
    source_at: bundle.generated_at,
    status: "starting",
  });
  const log = (entry) =>
    appendFileSync(
      `${instance.state}/push.log`,
      JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n",
    );
  log({ event: "start", endpoint, source_at: bundle.generated_at });
  const result = await pushBundle(
    bundle,
    transferSender(endpoint, token, {
      onRetry: (retry) => {
        log({ event: "retry", ...retry });
        console.error(
          `请求重试 ${retry.attempt}/8，${retry.delay / 1000}秒后继续：${retry.message}`,
        );
      },
    }),
    ({ id, done, total, resumed }) => {
      const state = {
        at: new Date().toISOString(),
        endpoint,
        id,
        done,
        total,
        resumed,
        status: done === total ? "complete" : "running",
      };
      saveProgress(state);
      log({ event: "progress", ...state });
      if (done === resumed || done === total || done % 25 === 0)
        console.error(
          `推送 ${done}/${total}${resumed ? `（恢复时已完成 ${resumed} 批）` : ""}`,
        );
    },
  );
  log({ event: "complete", ...result });
  console.log(JSON.stringify(result));
} catch (error) {
  if (lastState) {
    saveProgress({
      ...lastState,
      at: new Date().toISOString(),
      status: "failed",
      error: error.message,
    });
    appendFileSync(
      `${instance.state}/push.log`,
      JSON.stringify({
        at: new Date().toISOString(),
        event: "failed",
        error: error.message,
      }) + "\n",
    );
  }
  console.error(error.message);
  process.exitCode = 1;
}
