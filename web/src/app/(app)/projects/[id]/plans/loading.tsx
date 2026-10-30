import { SkeletonRows } from "@/components/common";

export default function Loading() {
  return <SkeletonRows rows={4} className="m-4 rounded-lg border bg-card p-4 md:m-6" />;
}
