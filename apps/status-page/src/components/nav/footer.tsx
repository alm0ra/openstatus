"use client";

import { Clock } from "@openstatus/icons";
import {
  StatusPageFooter,
  StatusPageFooterActions,
  StatusPageFooterContent,
  StatusPagePoweredBy,
} from "@openstatus/ui/components/blocks/status-page-footer";
import { Skeleton } from "@openstatus/ui/components/ui/skeleton";
import { cn } from "@openstatus/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useEmbed } from "../../hooks/use-embed";
import { useTRPC } from "../../lib/trpc/client";
import { Link } from "../common/link";
import { TimestampHoverCard } from "../content/timestamp-hover-card";

export function Footer({
  className,
  ...props
}: React.ComponentProps<"footer">) {
  const { domain } = useParams<{ domain: string }>();
  const [isMounted, setIsMounted] = useState(false);
  const trpc = useTRPC();
  const { data: page, dataUpdatedAt } = useQuery({
    ...trpc.statusPage.get.queryOptions({ slug: domain }),
  });
  const embed = useEmbed();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!page) return null;

  // Whitelabel pages: hide the footer entirely in embed mode.
  // Non-whitelabel pages: keep the "powered by" attribution visible; right-side controls hidden via CSS.
  if (embed.mode && page.whiteLabel) return null;

  return (
    <StatusPageFooter
      className={cn("group-data-[embed=true]/embed:border-t-0", className)}
      {...props}
    >
      <StatusPageFooterContent className="max-w-3xl flex-wrap gap-4 px-4 py-5 group-data-[embed=true]/embed:justify-center sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-foreground text-xs font-medium tracking-wide">
            نقطه / وضعیت
          </span>
          {!page.whiteLabel ? (
            <StatusPagePoweredBy>
              <Link
                href={`https://openstatus.dev?utm_medium=status-page&utm_source=${page.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                openstatus.dev
              </Link>
            </StatusPagePoweredBy>
          ) : null}
        </div>
        <StatusPageFooterActions className="group-data-[embed=true]/embed:hidden">
          <TimestampHoverCard
            date={new Date(dataUpdatedAt)}
            side="top"
            align="end"
            className="text-muted-foreground/70 me-2 flex items-center gap-1.5"
          >
            {isMounted ? (
              <>
                <Clock className="size-3" />
                <span className="font-mono text-xs">
                  {timezone === "Asia/Tehran" ? "زمان تهران" : timezone}
                </span>
              </>
            ) : (
              <Skeleton className="h-4 w-28" />
            )}
          </TimestampHoverCard>
        </StatusPageFooterActions>
      </StatusPageFooterContent>
    </StatusPageFooter>
  );
}
