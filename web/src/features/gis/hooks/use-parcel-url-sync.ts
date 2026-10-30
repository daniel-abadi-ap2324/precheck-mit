"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useGisStore } from "../store";

/** Sincroniza la parcela seleccionada con ?parcel= (enlace compartible). La URL inicial manda al montar. */
export function useParcelUrlSync(initialParcelId: string | null) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    useGisStore.getState().selectParcel(initialParcelId);
  }, [initialParcelId]);

  useEffect(() => {
    return useGisStore.subscribe((state, prev) => {
      if (state.selectedParcelId === prev.selectedParcelId) return;
      const params = new URLSearchParams(window.location.search);
      if (state.selectedParcelId) params.set("parcel", state.selectedParcelId);
      else params.delete("parcel");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }, [pathname, router]);
}
