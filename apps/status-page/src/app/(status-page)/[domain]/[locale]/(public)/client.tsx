"use client";

import {
  StatusComponent,
  StatusComponentBody,
  StatusComponentDescription,
  StatusComponentFooter,
  StatusComponentHeader,
  StatusComponentHeaderLeft,
  StatusComponentHeaderRight,
  StatusComponentIcon,
  StatusComponentLatency,
  StatusComponentLatencySkeleton,
  StatusComponentStatus,
  StatusComponentTitle,
  StatusComponentUptime,
  StatusComponentUptimeSkeleton,
} from "@openstatus/ui/components/blocks/status-component";
import {
  Status,
  StatusContent,
  StatusDescription,
  StatusHeader,
  StatusTitle,
} from "@openstatus/ui/components/blocks/status-layout";
import { Separator } from "@openstatus/ui/components/ui/separator";
import { cn } from "@openstatus/ui/lib/utils";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useExtracted } from "next-intl";
import { notFound, useParams } from "next/navigation";
import { useMemo } from "react";

import { Link } from "../../../../../components/common/link";
import { useStatusPage } from "../../../../../components/status-page/floating-button";
import { StatusBanner } from "../../../../../components/status-page/status-banner";
import {
  StatusBar,
  StatusBarSkeleton,
} from "../../../../../components/status-page/status-bar";
import { StatusComponentGroup } from "../../../../../components/status-page/status-component-group";
import { StatusFeed } from "../../../../../components/status-page/status-feed";
import { latencyByMonitorId } from "../../../../../data/metrics.client";
import { useEmbed } from "../../../../../hooks/use-embed";
import { usePathnamePrefix } from "../../../../../hooks/use-pathname-prefix";
import { updatesWithImpactChanges } from "../../../../../lib/report-impacts";
import { useTRPC } from "../../../../../lib/trpc/client";

export function Client() {
  const prefix = usePathnamePrefix();
  const { domain } = useParams<{ domain: string }>();
  const { cardType, barType, showUptime, numberOfDays } = useStatusPage();
  const embed = useEmbed();
  const trpc = useTRPC();
  const t = useExtracted();

  // NOTE: we cannot use `cardType` and `barType` here because of queryKey changes
  // It wouldn't match the server prefetch keys and we would have to refetch the page here
  const {
    data: pageInitial,
    error,
    isLoading: isPageLoading,
  } = useQuery({
    ...trpc.statusPage.get.queryOptions({
      slug: domain,
    }),
    enabled: !!domain,
  });

  // Handle case where page doesn't exist or query fails
  if (!isPageLoading && (error || !pageInitial)) {
    notFound();
  }

  const componentsVisible =
    !embed.mode || embed.sections.includes("components");

  const hasCustomConfig = pageInitial?.configuration
    ? pageInitial.configuration.type !== barType ||
      pageInitial.configuration.value !== cardType
    : false;

  // NOTE: instead, we use the `enabled` flag to only fetch the page if the configuration differs.
  // Also skip when `components` section is hidden in embed mode — this query only matters there.
  const { data: pageWithCustomConfiguration } = useQuery({
    ...trpc.statusPage.get.queryOptions({
      slug: domain,
      cardType,
      barType,
    }),
    enabled: !!domain && hasCustomConfig && componentsVisible,
  });

  // NOTE: we can prefetch that to avoid loading state
  // NOTE: using skipToken instead of enabled:false to prevent tRPC from including this in a batch request with undefined input
  const { data: uptimeData, isLoading } = useQuery(
    trpc.statusPage.getUptime.queryOptions(
      componentsVisible && pageInitial && pageInitial.pageComponents.length > 0
        ? {
            slug: domain,
            pageComponentIds: pageInitial.pageComponents.map((c) =>
              c.id.toString(),
            ),
            cardType,
            barType,
            days: numberOfDays,
          }
        : skipToken,
    ),
  );

  // Non-blocking latency read for the per-monitor "p75 ms" tracker chip. Reuses
  // the public monitors query (already registers the multi-latency pipe) so the
  // tracker rows never wait on it — the chip fills in once resolved.
  const { data: monitorsLatency, isFetching: isLatencyFetching } = useQuery(
    trpc.statusPage.getMonitors.queryOptions(
      componentsVisible && pageInitial && pageInitial.pageComponents.length > 0
        ? { slug: domain }
        : skipToken,
    ),
  );
  const latencyMap = useMemo(
    () => latencyByMonitorId(monitorsLatency, "p75"),
    [monitorsLatency],
  );
  const latencyPending = !monitorsLatency && isLatencyFetching;

  // Only public monitors get a chip: private monitors aren't in `getMonitors`
  // (value never arrives) and static components have no monitor.
  const buildLatency = (
    row: NonNullable<typeof uptimeData>[number] | undefined,
  ) => {
    if (!row?.monitor?.public) return undefined;
    const monitorId = row.monitor.id.toString();
    return {
      label: t("last day"),
      isLoading: latencyPending,
      value: latencyMap.get(monitorId),
      href: `${prefix ? `/${prefix}` : ""}/monitors/${monitorId}`,
    };
  };

  // NOTE: we need to filter out the incidents as we don't want to show all of them in the banner - a single one is enough
  // REMINDER: we could move that to the server - but we might wanna have the info of all openEvents actually
  const events = useMemo(() => {
    let hasIncident = false;
    return (
      pageInitial?.openEvents.filter((e) => {
        if (e.type !== "incident") return true;
        if (hasIncident) return false;
        hasIncident = true;
        return true;
      }) ?? []
    );
  }, [pageInitial]);

  if (!pageInitial) return null;

  // REMINDER: if we are using the custom configuration, we need to use the pageWithCustomConfiguration
  const page = pageWithCustomConfiguration ?? pageInitial;
  const latestReport = [...page.statusReports]
    .filter(
      (report) =>
        report.status !== "resolved" && report.statusReportUpdates.length > 0,
    )
    .sort(
      (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
    )[0];
  const latestUpdate = latestReport
    ? [...latestReport.statusReportUpdates].sort(
        (a, b) => b.date.getTime() - a.date.getTime(),
      )[0]
    : undefined;
  const latestEvent =
    events.find(
      (event) => event.type === "report" && event.id === latestReport?.id,
    ) ?? events[0];
  const severity =
    latestEvent?.status === "error"
      ? "error"
      : latestEvent?.status === "info"
        ? "info"
        : "degraded";
  const severityLabel =
    severity === "error"
      ? "قطعی سرویس"
      : severity === "info"
        ? "تعمیر و نگهداری"
        : "اختلال در عملکرد";
  const progressLabel = latestUpdate
    ? {
        investigating: "در حال بررسی",
        identified: "شناسایی شده",
        monitoring: "در حال پایش",
        resolved: "رفع شده",
      }[latestUpdate.status]
    : "در حال پیگیری";

  return (
    <div className="flex flex-col gap-6">
      <Status variant={page.status}>
        <StatusHeader className="group-data-[hide-title=true]/embed:hidden">
          <StatusTitle
            role="heading"
            aria-level={1}
            className="text-xl leading-tight font-semibold sm:text-2xl"
          >
            {page.title}
          </StatusTitle>
          <StatusDescription className="text-muted-foreground mt-2 max-w-prose text-xs leading-6">
            {page.description}
          </StatusDescription>
        </StatusHeader>
        {events.length > 0 ? (
          <StatusContent className="group-data-[hide-banner=true]/embed:hidden">
            <section
              className="noqte-summary overflow-hidden rounded-lg border"
              data-severity={severity}
              aria-label="آخرین مشکل"
            >
              <div className="noqte-summary-heading flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <h2 className="text-base font-semibold">
                  {latestReport?.title ?? latestEvent?.name ?? severityLabel}
                </h2>
                <span className="shrink-0 text-xs font-medium">
                  {severityLabel}
                </span>
              </div>
              <div className="space-y-3 px-5 py-4">
                <p className="text-sm leading-7">
                  <strong>{progressLabel}</strong>
                  {latestUpdate
                    ? ` — ${latestUpdate.message.length > 280 ? `${latestUpdate.message.slice(0, 280)}…` : latestUpdate.message}`
                    : " — جزئیات رویداد در تاریخچه در دسترس است."}
                </p>
                <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-xs">
                  <span>
                    {latestUpdate
                      ? new Intl.DateTimeFormat("fa-IR", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Tehran",
                        }).format(latestUpdate.date) + " · تهران"
                      : null}
                  </span>
                  <a
                    href="#event-history"
                    className="underline underline-offset-4"
                  >
                    {new Intl.NumberFormat("fa").format(events.length)} رویداد
                    باز · مشاهدهٔ جزئیات
                  </a>
                </div>
              </div>
            </section>
          </StatusContent>
        ) : (
          <StatusBanner
            status={page.status}
            className="group-data-[hide-banner=true]/embed:hidden"
          />
        )}
        {/* NOTE: check what gap feels right */}
        {page.trackers.length > 0 ? (
          <StatusContent className="noqte-monitors gap-0 overflow-hidden rounded-lg border group-data-[hide-components=true]/embed:hidden">
            {page.trackers.map((tracker) => {
              if (tracker.type === "component") {
                const component = tracker.component;
                const uptimeRow = uptimeData?.find(
                  (u) => u.pageComponentId === component.id,
                );
                const { data, uptime } = uptimeRow ?? {};

                return (
                  <ComponentCard
                    key={`component-${component.id}`}
                    name={component.name}
                    description={component.description}
                    status={component.status}
                    data={data}
                    uptime={uptime}
                    showUptime={showUptime}
                    isLoading={isLoading}
                    latency={buildLatency(uptimeRow)}
                  />
                );
              }

              return (
                <StatusComponentGroup
                  key={`group-${tracker.groupId}`}
                  title={tracker.groupName}
                  status={tracker.status}
                  defaultOpen={tracker.defaultOpen}
                >
                  {tracker.components.map((component) => {
                    const uptimeRow = uptimeData?.find(
                      (u) => u.pageComponentId === component.id,
                    );
                    const { data, uptime } = uptimeRow ?? {};

                    return (
                      <ComponentCard
                        key={`component-${component.id}`}
                        name={component.name}
                        description={component.description}
                        status={component.status}
                        data={data}
                        uptime={uptime}
                        showUptime={showUptime}
                        isLoading={isLoading}
                        latency={buildLatency(uptimeRow)}
                      />
                    );
                  })}
                </StatusComponentGroup>
              );
            })}
          </StatusContent>
        ) : null}
        <Separator className="group-data-[hide-components=true]/embed:hidden group-data-[hide-feed=true]/embed:hidden" />
        <StatusContent
          id="event-history"
          className="scroll-mt-6 group-data-[hide-feed=true]/embed:hidden"
        >
          <h2 className="mb-4 text-xl font-semibold">تاریخچهٔ رویدادها</h2>
          <StatusFeed
            statusReports={page.statusReports
              .filter((report) => report.statusReportUpdates.length > 0)
              .map((report) => ({
                ...report,
                affected: report.statusReportsToPageComponents.map(
                  (component) => component.pageComponent.name,
                ),
                updates: updatesWithImpactChanges(report),
              }))}
            maintenances={page.maintenances
              .filter((maintenance) =>
                page.lastEvents.some(
                  (event) =>
                    event.id === maintenance.id && event.type === "maintenance",
                ),
              )
              .map((maintenance) => ({
                ...maintenance,
                affected: maintenance.maintenancesToPageComponents.map(
                  (component) => component.pageComponent.name,
                ),
              }))}
          />
        </StatusContent>
      </Status>
    </div>
  );
}

type ComponentCardData = NonNullable<Parameters<typeof StatusBar>[0]["data"]>;

function ComponentCard({
  name,
  description,
  status,
  data,
  uptime,
  showUptime,
  isLoading,
  latency,
}: {
  name: string;
  description?: string | null;
  status: "success" | "degraded" | "error" | "info";
  data?: ComponentCardData;
  uptime?: string;
  showUptime?: boolean;
  isLoading?: boolean;
  latency?: { label: string; isLoading: boolean; value?: string; href: string };
}) {
  return (
    <StatusComponent variant={status}>
      <StatusComponentHeader>
        <StatusComponentHeaderLeft>
          <StatusComponentTitle>{name}</StatusComponentTitle>
          <StatusComponentDescription>{description}</StatusComponentDescription>
          {latency ? (
            latency.value ? (
              <Link
                href={latency.href}
                variant="unstyled"
                className="shrink-0 rounded-md focus-visible:ring-inset"
              >
                <StatusComponentLatency>
                  <span className="text-muted-foreground/70">
                    {latency.label}
                  </span>
                  <span className="text-foreground">{latency.value}</span>
                  <span>p75</span>
                </StatusComponentLatency>
              </Link>
            ) : latency.isLoading ? (
              <StatusComponentLatencySkeleton className="shrink-0" />
            ) : null
          ) : null}
        </StatusComponentHeaderLeft>
        <StatusComponentHeaderRight>
          {showUptime ? (
            <>
              {isLoading ? (
                <StatusComponentUptimeSkeleton />
              ) : (
                <StatusComponentUptime>{uptime}</StatusComponentUptime>
              )}
              <StatusComponentIcon />
            </>
          ) : (
            <StatusComponentStatus />
          )}
        </StatusComponentHeaderRight>
      </StatusComponentHeader>
      <StatusComponentBody dir="ltr">
        {isLoading ? <StatusBarSkeleton /> : <StatusBar data={data ?? []} />}
        <StatusComponentFooter data={data ?? []} isLoading={isLoading} />
      </StatusComponentBody>
    </StatusComponent>
  );
}
