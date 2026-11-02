import { ANALYTICS_ID, ANALYTICS_SCRIPT } from "../../shared/site";
export function About() {
  return (
    <article className="prose-copy max-w-3xl py-12">
      <div className="text-xs font-semibold tracking-[.2em] text-primary">
        DATA & METHODOLOGY
      </div>
      <h1 className="mt-3 text-4xl font-semibold">
        比价之前，先了解这些报价。
      </h1>
      {[
        [
          "来源与比较",
          "报价来自已登记店铺的公开商品目录和详情。首次核验时按地区、订阅时长、交付方式与渠道分别归类，后续沿用分类更新价格与库存；标题中的关键规格变化时暂停比价。分类依据与售后条款保留首次核验结果，购买前请在原店确认。",
        ],
        [
          "价格与库存",
          "展示单件货架标价，手续费与实际结算金额未核验。库存为采集时观察，购买前请回原店确认。",
        ],
        [
          "如何更新",
          "报价按批次采集并核验，页面保留实际观察时间。超过有效期、采集失败或不符合购买条件的记录，不参与当前比价。",
        ],
        [
          "数据访问",
          "页面按需查询报价；完整快照、待审核商品与操作日志不公开。",
        ],
        [
          "访问统计",
          ANALYTICS_ID && ANALYTICS_SCRIPT ? "本实例使用 Umami 统计公开页面的访问量与来源；浏览器开启「请勿追踪」时不统计，后台页面不统计。" : "本实例未启用访问统计。",
        ],
        [
          "收藏与纠错",
          "收藏仅保存在当前浏览器，不上传服务器，也不会跨设备同步。报价纠错会保存反馈内容和该条报价的来源、价格及采集时间，供管理员核实，不公开展示；为限制重复提交，使用按日变化的网络标识摘要，不保存原始 IP。",
        ],
      ].map(([h, p]) => (
        <section key={h}>
          <h2 className="mt-9 text-xl font-semibold text-foreground">{h}</h2>
          <p>{p}</p>
        </section>
      ))}
    </article>
  );
}
