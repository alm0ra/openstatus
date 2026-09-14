"use client";

import { StatusBar as BlockStatusBar } from "@openstatus/ui/components/blocks/status-bar";

import { usePathnamePrefix } from "../../hooks/use-pathname-prefix";
import { Link } from "../common/link";

export { StatusBarSkeleton } from "@openstatus/ui/components/blocks/status-bar";

/**
 * StatusBar — wrapper that wires Next.js `<Link>` (with locale/slug prefix)
 * around report/maintenance event badges in the hover card. Incidents stay
 * unwrapped (no detail page).
 */
export function StatusBar(
  props: Omit<React.ComponentProps<typeof BlockStatusBar>, "renderEvent">,
) {
  const prefix = usePathnamePrefix();
  return (
    <BlockStatusBar
      renderEvent={(event, index) => {
        const start = event.from ? new Date(event.from) : null;
        const end = event.to ? new Date(event.to) : null;
        const format = (date: Date) =>
          new Intl.DateTimeFormat("fa-IR", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Tehran",
          }).format(date);
        const minutes = start
          ? Math.max(
              0,
              Math.floor(
                ((end ?? new Date()).getTime() - start.getTime()) / 60000,
              ),
            )
          : 0;
        const number = new Intl.NumberFormat("fa");
        const duration =
          [
            Math.floor(minutes / 1440)
              ? `${number.format(Math.floor(minutes / 1440))} روز`
              : "",
            Math.floor((minutes % 1440) / 60)
              ? `${number.format(Math.floor((minutes % 1440) / 60))} ساعت`
              : "",
            minutes % 60 ? `${number.format(minutes % 60)} دقیقه` : "",
          ]
            .filter(Boolean)
            .join(" و ") || "کمتر از یک دقیقه";
        const node = (
          <div className="space-y-2 text-start" dir="rtl">
            <p className="text-sm leading-6 font-medium">{event.name}</p>
            <dl className="text-muted-foreground space-y-1 text-xs leading-6">
              <div>
                <dt className="inline">شروع: </dt>
                <dd className="inline">{start ? format(start) : "ثبت نشده"}</dd>
              </div>
              <div>
                <dt className="inline">پایان: </dt>
                <dd className="inline">{end ? format(end) : "ادامه دارد"}</dd>
              </div>
              <div>
                <dt className="inline">مدت{end ? "" : " تا این لحظه"}: </dt>
                <dd className="inline">{start ? duration : "نامشخص"}</dd>
              </div>
            </dl>
            <p className="text-muted-foreground text-xs">
              زمان تهران{end ? "" : " · هنوز رفع نشده"}
            </p>
          </div>
        );
        if (event.type === "report" || event.type === "maintenance") {
          return (
            <Link
              variant="unstyled"
              key={`${event.id}-${event.type}-${index}`}
              href={`${prefix ? `/${prefix}` : ""}/events/${event.type}/${event.id}`}
            >
              {node}
            </Link>
          );
        }
        return node;
      }}
      {...props}
    />
  );
}
