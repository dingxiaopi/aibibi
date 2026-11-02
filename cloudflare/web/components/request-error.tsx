import { Button } from "@/components/ui/button";

export function RequestError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div
      role="alert"
      className="my-6 rounded-lg border border-destructive/30 bg-card p-6"
    >
      <p className="mb-4 text-sm text-destructive">{message}</p>
      <Button variant="outline" onClick={retry}>
        重新查询
      </Button>
    </div>
  );
}
