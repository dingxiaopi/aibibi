import { Star } from "lucide-react";
import { Link } from "../components/link";
import { FavoriteButton } from "../components/favorite-button";
import { useFavorites } from "../lib/favorites";
import { useCatalog } from "../lib/catalog-context";
import { money } from "../lib/catalog-format";
import { RequestError } from "../components/request-error";

export function FavoritesPage() {
  const { favorites } = useFavorites();
  const { catalog, shops, shopLoading, shopError, retryShops } = useCatalog();
  return (
    <>
      <div className="catalog-page-title">
        <h1>我的收藏</h1>
        <p>
          收藏商品和店铺，下次打开这个浏览器就能继续查看。无需注册，收藏不会上传到服务器。
        </p>
        {!favorites.persistent && (
          <p role="alert">浏览器未允许保存，当前收藏仅在本次页面有效。</p>
        )}
      </div>
      {catalog.error && (
        <RequestError message={catalog.error} retry={catalog.retry} />
      )}
      {shopError && <RequestError message={shopError} retry={retryShops} />}
      {!favorites.products.length && !favorites.shops.length && (
        <div className="empty-results">
          <Star size={28} />
          <h2>还没有收藏</h2>
          <p>在商品详情或店铺旁点击星标，就能在这里找到它。</p>
          <Link className="catalog-view-all" href="/">
            去挑选商品 →
          </Link>
        </div>
      )}
      {!!favorites.products.length && (
        <section className="favorites-section">
          <h2>收藏的商品 · {favorites.products.length}</h2>
          {favorites.products.map((id) => {
            const p = catalog.data?.products.find((p) => p.id === id);
            return (
              <article className="favorite-row" key={id}>
                <div>
                  <Link href={`/sku/${id}`}>{p?.name || id}</Link>
                  <p>
                    {p
                      ? p.spec
                      : catalog.loading
                        ? "正在读取商品…"
                        : "商品当前不可用"}
                  </p>
                </div>
                <strong>
                  {p?.min_price != null
                    ? `¥${money(p.min_price)} 起`
                    : "暂无有效报价"}
                </strong>
                <FavoriteButton kind="products" id={id} name={p?.name || id} />
              </article>
            );
          })}
        </section>
      )}
      {!!favorites.shops.length && (
        <section className="favorites-section">
          <h2>收藏的店铺 · {favorites.shops.length}</h2>
          {favorites.shops.map((id) => {
            const s = shops.find((s) => s.id === id);
            return (
              <article className="favorite-row" key={id}>
                <div>
                  <Link href={`/shops/${id}`}>{s?.name || id}</Link>
                  <p>
                    {s
                      ? s.listed
                        ? `${s.active_quotes || 0} 条可比价报价`
                        : "暂不在公开店铺目录"
                      : shopLoading
                        ? "正在读取店铺…"
                        : "店铺当前不可用"}
                  </p>
                </div>
                <FavoriteButton kind="shops" id={id} name={s?.name || id} />
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
