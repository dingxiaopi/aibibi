import { Star } from "lucide-react";
import { Button } from "./ui/button";
import { useFavorites, type FavoriteKind } from "../lib/favorites";

export function FavoriteButton({
  kind,
  id,
  name,
  compact = false,
}: {
  kind: FavoriteKind;
  id: string;
  name: string;
  compact?: boolean;
}) {
  const { favorites, toggle } = useFavorites();
  const saved = favorites[kind].includes(id);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="favorite-toggle"
      data-saved={saved || undefined}
      aria-label={`${saved ? "取消收藏" : "收藏"}${name}`}
      aria-pressed={saved}
      title={
        favorites.persistent
          ? `${saved ? "取消收藏" : "收藏"}${name}`
          : "浏览器无法持久保存，收藏仅在本次页面有效"
      }
      onClick={() => toggle(kind, id)}
    >
      <Star
        size={15}
        fill={saved ? "currentColor" : "none"}
        aria-hidden="true"
      />
      {!compact && <span>{saved ? "已收藏" : "收藏"}</span>}
    </Button>
  );
}
