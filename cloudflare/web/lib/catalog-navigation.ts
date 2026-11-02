import type { Product, QuoteSummary } from "../../shared/api-types";
/** Presentation groups only: each SKU keeps its own quote and eligibility rules. */
export type NavigationProduct = Pick<Product, "id" | "name" | "category"> &
  Partial<Product & QuoteSummary>;
type Definition = {
  id: string;
  category: string;
  family: string;
  label: string;
  description: string;
  variants: [string, string][];
};
export type CatalogGroup = Omit<Definition, "variants"> & {
  products: NavigationProduct[];
  labels: Record<string, string>;
};
const definitions: Definition[] = [];
function define(
  category: string,
  family: string,
  id: string,
  label: string,
  description: string,
  variants: [string, string][],
) {
  definitions.push({ category, family, id, label, description, variants });
}
define(
  "gpt",
  "Plus",
  "plus-month",
  "Plus 月付直充",
  "充值到自己的账号，按地区和支付渠道选择。",
  [
    ["plus-phi", "菲区卡充"],
    ["plus-ios", "美区 iOS"],
    ["plus-card", "官网卡付"],
    ["plus-phi-cdk-30d", "菲区自助CDK"],
  ],
);
define(
  "gpt",
  "Plus",
  "plus-account",
  "Plus 成品号",
  "交付已开通会员的独享账号，按地区选择。",
  [
    ["plus-account-phi-month", "菲区成品号"],
    ["plus-account-ios-month", "美区 iOS 成品号"],
    ["plus-account-jp-month", "日本成品号"],
    ["plus-account-vn-month", "越南成品号"],
    ["plus-account-vn-apple-month", "越南 Apple 支付成品号"],
    ["plus-account-br-month", "巴西成品号"],
    ["plus-account-month", "成品号 · 渠道未标注"],
  ],
);
define(
  "gpt",
  "Plus",
  "plus-shared",
  "Plus 共享账号",
  "多人共用账号和额度，单独查看共享条件。",
  [["plus-shared-10-month", "10人共享 · 30天"]],
);
define(
  "gpt",
  "Plus",
  "plus-year",
  "Plus 年卡",
  "年付直充，按实际订阅天数选择。",
  [
    ["plus-year-ios-360", "美区 iOS · 360天"],
    ["plus-year-ios-365", "美区 iOS · 365天"],
  ],
);
define(
  "gpt",
  "Plus",
  "plus-mirror",
  "Plus 网页镜像",
  "第三方网页服务，按使用时长选择。",
  [
    ["plus-mirror-month", "镜像月卡"],
    ["plus-mirror-quarter", "镜像季卡"],
  ],
);
define(
  "gpt",
  "Pro",
  "pro100",
  "Pro 100美元档 / 5X",
  "同一档位下，按充值地区和渠道选择。",
  [
    ["pro100-ios", "美区 iOS"],
    ["pro100-phi", "菲区卡充"],
    ["pro100-card", "官网卡付"],
    ["pro100-chile", "智利卡充"],
    ["pro100-egypt-cdk-month", "埃及卡付 · 自助CDK"],
  ],
);
define(
  "gpt",
  "Pro",
  "pro200",
  "Pro 200美元档",
  "按支付渠道选择，菲区续费有单独账号要求。",
  [
    ["pro200-phi", "菲区卡充"],
    ["pro200-ios", "美区 iOS"],
    ["pro200-card", "官网卡付"],
    ["pro200-phi-renewal", "菲区续费专用"],
    ["pro200-card-cdk", "官网卡付 · 自助CDK"],
  ],
);
define("gpt", "Pro", "pro500", "Pro 500美元档", "按充值地区和支付渠道选择。", [
  ["pro500-phi", "菲区卡充"],
  ["pro500-ios", "美区 iOS"],
  ["pro500-egypt-cdk-month", "埃及卡付 · 自助CDK"],
]);
define(
  "gpt",
  "Go",
  "go-month",
  "Go 月付直充",
  "充值现有账号，按支付渠道选择。",
  [
    ["go-phi", "菲区卡充"],
    ["go-card", "官网卡付"],
    ["go-egypt-cdk-month", "埃及卡付 · 自助CDK"],
  ],
);
define(
  "gpt",
  "Team",
  "team-seat",
  "Team 普通席位",
  "邀请自己的账号加入团队空间，按席位时长选择。",
  [
    ["team-seat-30d", "普通席位 · 30天"],
    ["team-seat-25d", "普通席位 · 约25天"],
  ],
);
define(
  "gpt",
  "Codex",
  "codex-credits",
  "Codex 使用额度",
  "按点数选择，充值前确认账号购买资格。",
  [250, 500, 1000, 2500].map((n) => [`codex-credits-${n}`, `${n}点`]),
);

define(
  "claude",
  "Pro",
  "claude-pro-month",
  "Pro 月付直充",
  "充值自己的账号，核对现有订阅和账号资格。",
  [
    ["claude-ios", "iOS 月付直充"],
    ["claude-pro-uid-month", "UID直充 · 地区未标注"],
    ["claude-pro-ng-month", "尼日利亚区直充"],
  ],
);
define(
  "claude",
  "Pro",
  "claude-pro-account",
  "Pro 独享成品号",
  "交付已开通 Pro 的账号。",
  [["claude-pro-account-month", "独享成品号 · 30天"]],
);
define(
  "claude",
  "Max",
  "claude-max5",
  "Max 5X 直充",
  "同一档位按支付渠道选择。",
  [
    ["claude-max5-ios", "iOS 直充"],
    ["claude-max5-us-card", "美区官网卡付"],
  ],
);
define(
  "claude",
  "Max",
  "claude-max20",
  "Max 20X 直充",
  "充值现有账号，核对档位与账号资格。",
  [["claude-max20-card", "官网卡付"]],
);
define(
  "claude",
  "Max",
  "claude-max5-account",
  "Max 5X 成品号",
  "交付已开通 Max 5X 的账号。",
  [["claude-max5-account-ios", "iOS 成品号 · 30天"]],
);
define(
  "claude",
  "Max",
  "claude-max20-account",
  "Max 20X 成品号",
  "交付已开通 Max 20X 的账号，核对原店标注时长及售后。",
  [["claude-max20-account-ios-month", "美区 iOS 成品号 · 31天"]],
);

define(
  "grok",
  "SuperGrok",
  "supergrok-month",
  "SuperGrok 月付直充",
  "按渠道和版本选择，旧版权益单独标明。",
  [
    ["grok-ios", "iOS · 版本未标注"],
    ["grok-super-legacy-ios", "旧版 iOS · 不含Cursor"],
    ["grok-super-card-month", "自助直充 · 渠道未标注"],
    ["grok-super-legacy-cdk-month", "旧版 · 自助CDK"],
  ],
);
define(
  "grok",
  "SuperGrok",
  "supergrok-quarter",
  "SuperGrok 季卡",
  "季付直充现有账号。",
  [
    ["grok-quarter-ios", "iOS · 90天"],
    ["grok-super-quarter-direct", "直充 · 渠道未标注"],
    ["grok-super-legacy-cdk-quarter", "旧版 · 自助CDK"],
  ],
);
define(
  "grok",
  "Ultra",
  "grok-ultra-month",
  "Ultra 月付直充",
  "200美元档位，自助充值现有账号。",
  [["grok-ultra-200-month", "200美元档 · 30天"]],
);
define(
  "grok",
  "Ultra",
  "grok-ultra-account",
  "Ultra 成品号",
  "交付会员成品账号，查看首登质保条件。",
  [
    ["grok-ultra-account-month", "Google内购成品号"],
    ["grok-ultra-account-month-generic", "成品号 · 渠道未标注"],
  ],
);

define(
  "claude",
  "Pro",
  "claude-pro-self",
  "Pro 自助 CDK",
  "非 iOS 自助充值，核对账号 KYC 和订阅状态。",
  [["claude-pro-self-month", "非iOS · 地区未标注"]],
);
define(
  "claude",
  "Max",
  "claude-max5-self",
  "Max 5X 自助充值",
  "按卡付或未标注渠道分别核对，价格保持独立。",
  [
    ["claude-max5-card-month", "卡付 · 地区未标注"],
    ["claude-max5-self-month", "自助CDK · 非iOS"],
  ],
);
define(
  "claude",
  "Max",
  "claude-max20-self",
  "Max 20X 自助 CDK",
  "自备完成 KYC 的账号，不支持覆盖现有订阅。",
  [["claude-max20-self-month", "自助CDK · 渠道未标注"]],
);
for (const family of ["Plus", "Premium", "Super", "Ultra"]) {
  define(
    "grok",
    family,
    `grok-${family.toLowerCase()}-us`,
    `${family} 美区卡充`,
    "仅限带半价充值资格的账号；订阅周期向原店确认。",
    [[`grok-${family.toLowerCase()}-us-card`, "美区卡付 · 需半价资格"]],
  );
}
define(
  "grok",
  "Premium",
  "grok-premium-manual",
  "Premium 人工直充",
  "iOS 月卡，购买后联系客服办理。",
  [["grok-premium-ios-month", "iOS月卡 · 人工办理"]],
);
define(
  "grok",
  "Ultra",
  "grok-ultra-manual",
  "Ultra 人工直充",
  "官网卡付，需半价资格及邮箱验证。",
  [["grok-ultra-manual-month", "官网月卡 · 人工办理"]],
);

define(
  "gemini",
  "Pro",
  "gemini-links",
  "Pro 活动资格链接",
  "按活动期限和绑卡要求选择，持续时长以原店条款为准。",
  [
    ["gemini-pro-18-link", "18个月活动 · 无需绑卡"],
    ["gemini-pro-3-link-card", "3个月资格 · 需自备卡"],
  ],
);
define(
  "gemini",
  "Pro",
  "gemini-accounts",
  "Pro 成品号",
  "按账号交付及反重力支持条件选择。",
  [
    ["gemini-pro-18-account", "18个月活动成品号"],
    ["gemini-pro-18-account-antigravity", "反重力成品号"],
  ],
);
define(
  "gemini",
  "Pro",
  "gemini-pixel",
  "Pro 年卡直充",
  "Pixel活动代开，需要自备符合条件的账号。",
  [["gemini-pro-pixel-year", "Pixel渠道 · 12个月"]],
);
define(
  "gemini",
  "Pro",
  "gemini-jio",
  "Pro 18个月 Jio直充",
  "通过 Jio 活动渠道直充现有账号，持续时长以原店条款为准。",
  [["gemini-pro-jio-18-direct", "Jio活动 · 18个月"]],
);
define(
  "gemini",
  "Ultra",
  "gemini-family",
  "Ultra 家庭组席位",
  "邀请自有账号进组，额度共享。",
  [["gemini-ultra-family-month", "月席位 · 不含Flow积分"]],
);

define(
  "cursor",
  "会员账号",
  "cursor-ultra",
  "Ultra 月卡成品号",
  "交付会员账号，核对订阅质保条件。",
  [["cursor-ultra-account-month", "Ultra 独享成品号"]],
);
define(
  "cursor",
  "第三方插件",
  "cursor-plugin",
  "Cursor 插件服务",
  "第三方插件计费服务，按使用时长选择。",
  [
    ["cursor-plugin-day", "日卡"],
    ["cursor-plugin-week", "周卡"],
    ["cursor-plugin-month", "月卡"],
  ],
);

define(
  "other",
  "Manus",
  "manus-credit",
  "积分直充",
  "充自己的 Manus 账号，按积分数量选择。",
  [2000, 5000, 10000].map((n) => [`manus-credit-${n}`, `${n}积分`]),
);
define(
  "other",
  "Manus",
  "manus-account",
  "Pro 成品号",
  "交付会员账号，核对首登质保条款。",
  [["manus-pro-5000-account", "5000积分成品号"]],
);
define(
  "other",
  "Telegram",
  "tg-direct",
  "Premium 人工直充",
  "提供用户名人工开通，按订阅时长选择。",
  [3, 6, 12].map((n) => [`tg-premium-direct-${n}`, `${n}个月直充`]),
);
define(
  "other",
  "Telegram",
  "tg-gift",
  "Premium 礼品链接",
  "礼品激活链接交付，按订阅时长选择。",
  [3, 6, 12].map((n) => [`tg-premium-gift-${n}`, `${n}个月礼品链接`]),
);
define(
  "other",
  "Perplexity",
  "perplexity-month",
  "Pro 月付直充",
  "充现有账号，按安卓或 iOS 渠道选择。",
  [
    ["perplexity-pro-ios-month", "iOS 月付"],
    ["perplexity-pro-android-month", "安卓月付"],
  ],
);
define(
  "other",
  "Perplexity",
  "perplexity-year",
  "Pro 特殊渠道年卡",
  "特殊渠道年卡，核对激活和售后条件。",
  [["perplexity-pro-year-special", "12个月 · 特殊渠道"]],
);
define(
  "other",
  "Runway",
  "runway-direct",
  "月付直充",
  "充现有账号，按 Pro 或 Max 套餐选择。",
  [
    ["runway-pro-ios-month", "Pro · iOS月付"],
    ["runway-max-ios-month", "Max · iOS月付"],
  ],
);
define(
  "other",
  "Runway",
  "runway-account",
  "积分成品号",
  "交付积分账号，核对首登和积分有效期。",
  [["runway-47500-account", "47500积分成品号"]],
);
define(
  "other",
  "Kiro",
  "kiro-account",
  "积分成品号",
  "JSON账号资料交付，按积分数量选择。",
  [1000, 5000, 10000].map((n) => [`kiro-credit-${n}-account`, `${n}积分`]),
);
define(
  "other",
  "Netflix",
  "netflix-shared",
  "共享车位",
  "指定共享车位，核对有效期及设备限制。",
  [["netflix-shared-26", "26天 · 不支持电视"]],
);
define(
  "other",
  "Figma",
  "figma-account",
  "年付成品号",
  "交付会员账号，按原店要求修改密码。",
  [["figma-year-account", "365天成品号"]],
);
define(
  "other",
  "X Premium",
  "x-premium-month",
  "Premium 月卡",
  "按新旧版本标注选择。",
  [
    ["x-premium-ios-month", "iOS · 版本未标注"],
    ["x-premium-legacy-ios-month", "旧版 iOS"],
  ],
);
define(
  "other",
  "X Premium",
  "x-premiumplus-month",
  "Premium+ 月卡",
  "iOS渠道直充，赠送权益以原店为准。",
  [["x-premiumplus-ios-month", "Premium+ · iOS月付"]],
);
define(
  "other",
  "X Premium",
  "x-premiumplus-year",
  "Premium+ 年卡",
  "按新旧版本标注选择，订阅和质保期限不同。",
  [
    ["x-premiumplus-ios-year", "iOS年付 · 版本未标注"],
    ["x-premiumplus-legacy-ios-year", "旧版 iOS年付"],
  ],
);
define(
  "other",
  "Apple",
  "apple-id",
  "Apple ID 下载号",
  "App Store下载成品账号，按地区选择。",
  [
    ["apple-id-us", "美国下载号"],
    ["apple-id-hk", "香港下载号"],
    ["apple-id-jp", "日本下载号"],
  ],
);
define(
  "other",
  "Apple",
  "apple-gift",
  "美区礼品卡",
  "兑换前核对账号地区和面额。",
  [["apple-gift-us-20", "美区 · 20美元"]],
);
define(
  "other",
  "Adobe",
  "adobe-link",
  "Express 年卡链接",
  "活动链接交付，核对账号和地区资格。",
  [["adobe-express-year-link", "Premium · 12个月活动"]],
);
define(
  "other",
  "Notion",
  "notion-link",
  "Business 活动链接",
  "需要自备符合条件的账号与支付卡。",
  [["notion-business-3-link", "3个月活动 · 需绑卡"]],
);
define(
  "other",
  "Leonardo",
  "leonardo-account",
  "积分成品号",
  "交付积分账号，核对首登和积分有效期。",
  [["leonardo-8500-account", "8500积分成品号"]],
);
define(
  "other",
  "Tavily",
  "tavily-key",
  "API 密钥",
  "独享API密钥，按月重置额度。",
  [["tavily-key-1000", "每月1000次"]],
);
define(
  "other",
  "小蓝 API",
  "xiaolan-time",
  "时长套餐",
  "第三方API站内额度，每24小时重置。",
  [
    ["xiaolan-api-day", "日卡"],
    ["xiaolan-api-week", "周卡"],
    ["xiaolan-api-month", "月卡"],
  ],
);
define(
  "other",
  "小蓝 API",
  "xiaolan-credit",
  "额度卡",
  "第三方API站内额度，按面额选择。",
  [30, 300, 500].map((n) => [`xiaolan-api-credit-${n}`, `${n}美元站内额度`]),
);
define(
  "other",
  "邮箱",
  "microsoft-mail",
  "微软邮箱令牌号",
  "交付邮箱及OAuth令牌，按邮箱后缀选择。",
  [
    ["mail-outlook-token", "Outlook"],
    ["mail-hotmail-token", "Hotmail"],
  ],
);
define(
  "other",
  "邮箱",
  "icloud-mail",
  "iCloud 隐私收件",
  "隐私收件服务，核对使用期限。",
  [["mail-icloud-3day", "3天收件服务"]],
);

export function catalogGroups(
  products: NavigationProduct[],
  category: string,
): CatalogGroup[] {
  const remaining = new Map(
    products.filter((p) => p.category === category).map((p) => [p.id, p]),
  );
  const groups: CatalogGroup[] = [];
  for (const definition of definitions.filter((d) => d.category === category)) {
    const members = definition.variants.flatMap(([id]) =>
      remaining.has(id) ? [remaining.get(id)!] : [],
    );
    if (!members.length) continue;
    groups.push({
      ...definition,
      products: members,
      labels: Object.fromEntries(definition.variants),
    });
    for (const product of members) remaining.delete(product.id);
  }
  // New specs stay visible until their presentation grouping is explicitly reviewed.
  for (const product of remaining.values())
    groups.push({
      id: `sku:${product.id}`,
      category,
      family: product.family || "其他类型",
      label: product.name,
      description: String(product.spec || ""),
      products: [product],
      labels: { [product.id]: product.name },
    });
  return groups;
}

export function groupTarget(group: CatalogGroup, current?: string): string {
  return (
    group.products.find((p) => p.id === current)?.id ||
    group.products.find((p) => Number.isFinite(p.min_price) && p.min_price! > 0)
      ?.id ||
    group.products[0].id
  );
}
