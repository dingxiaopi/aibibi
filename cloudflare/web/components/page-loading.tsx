import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
export function LoadingStatus({
  children = "正在读取数据…",
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="status" className={cn("loading-status", className)}>
      <Spinner aria-hidden="true" role={undefined} />
      <span>{children}</span>
    </div>
  );
}
export function RowSkeletons({ count = 5 }: { count?: number }) {
  return (
    <div className="loading-rows" aria-hidden="true">
      {Array.from({ length: count }, (_, n) => (
        <div className="loading-row" key={n}>
          <Skeleton className="size-8 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}
export function PageSkeleton({
  variant = "catalog",
  label = "正在读取数据…",
}: {
  variant?: "catalog" | "detail" | "shops" | "table" | "console";
  label?: string;
}) {
  return (
    <section
      className={`page-skeleton page-skeleton-${variant}`}
      aria-busy="true"
      aria-label={label}
    >
      <LoadingStatus>{label}</LoadingStatus>
      <div aria-hidden="true" className="space-y-3 mb-7">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {variant === "detail" ? (
        <div className="loading-detail-layout">
          <Card className="loading-sidebar">
            <CardContent>
              <RowSkeletons count={7} />
            </CardContent>
          </Card>
          <div>
            <div className="loading-facts">
              {[0, 1, 2].map((n) => (
                <Card key={n}>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-8 w-24 max-w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <RowSkeletons count={6} />
          </div>
        </div>
      ) : variant === "table" || variant === "console" ? (
        <RowSkeletons count={variant === "console" ? 5 : 4} />
      ) : (
        <div
          className={
            variant === "shops" ? "loading-shop-grid" : "loading-catalog-grid"
          }
        >
          {Array.from({ length: variant === "shops" ? 6 : 3 }, (_, n) => (
            <Card key={n}>
              <CardContent>
                <RowSkeletons count={variant === "shops" ? 1 : 4} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
