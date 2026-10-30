"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buttonVariants } from "@/components/ui/button";
import { useNotifications } from "@/hooks/use-api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationsMenu() {
  const { data = [] } = useNotifications();
  const unread = data.filter((n) => !n.read).length;
  return (
    <Popover>
      <PopoverTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")} aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ""}`}>
        <Bell aria-hidden className="size-[18px]" />
        {unread ? <span aria-hidden className="absolute top-1 right-1 size-2 rounded-full bg-fail" /> : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b px-3 py-2 text-sm font-medium">Notificaciones</p>
        <ul className="max-h-80 overflow-auto">
          {data.map((n) => (
            <li key={n.id} className="border-b last:border-0">
              <Link href={n.href ?? "#"} className="block px-3 py-2.5 hover:bg-muted">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {!n.read ? <span aria-label="sin leer" className="size-1.5 rounded-full bg-brand" /> : null}
                  {n.title}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{formatDate(n.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
