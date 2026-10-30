"use client";

import { ErrorState } from "@/components/common";

export default function ProjectsError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorState error={error} onRetry={reset} className="m-6" />;
}
