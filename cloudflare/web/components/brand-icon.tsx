import { Blocks } from "lucide-react";
import { cn } from "@/lib/utils";

const brands: Record<string, { file: string; label: string; mono?: boolean }> =
  {
    gpt: { file: "openai", label: "ChatGPT", mono: true },
    claude: { file: "claude-color", label: "Claude" },
    gemini: { file: "gemini-color", label: "Gemini" },
    grok: { file: "grok", label: "Grok", mono: true },
    cursor: { file: "cursor", label: "Cursor", mono: true },
    manus: { file: "manus", label: "Manus", mono: true },
    kiro: { file: "kiro-color", label: "Kiro" },
    runway: { file: "runway", label: "Runway", mono: true },
    perplexity: { file: "perplexity-color", label: "Perplexity" },
    tavily: { file: "tavily-color", label: "Tavily" },
    adobe: { file: "adobe-color", label: "Adobe" },
    apple: { file: "apple", label: "Apple", mono: true },
    telegram: { file: "telegram", label: "Telegram", mono: true },
    netflix: { file: "netflix", label: "Netflix", mono: true },
    figma: { file: "figma", label: "Figma", mono: true },
    notion: { file: "notion", label: "Notion", mono: true },
    x: { file: "x", label: "X", mono: true },
  };

export function BrandIcon({
  category,
  size = 24,
  className,
}: {
  category: string;
  size?: number;
  className?: string;
}) {
  const brand = brands[category];
  if (!brand)
    return <Blocks aria-hidden="true" size={size} className={className} />;
  return (
    <img
      src={`/brands/${brand.file}.svg`}
      width={size}
      height={size}
      className={cn("brand-icon", brand.mono && "brand-icon-mono", className)}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

export const brandLabel = (category: string) =>
  brands[category]?.label || (category === "other" ? "周边" : "AI");
