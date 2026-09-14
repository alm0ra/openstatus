"use client";

import type { RouterOutputs } from "@openstatus/api";
import { Menu, Chat } from "@openstatus/icons";
import { StatusPageGetInTouchIcon } from "@openstatus/ui/components/blocks/status-page-get-in-touch";
import {
  StatusPageHeader,
  StatusPageHeaderActions,
  StatusPageHeaderBrand,
  StatusPageHeaderBrandButton,
  StatusPageHeaderContent,
  StatusPageHeaderNav,
  StatusPageHeaderNavItem,
} from "@openstatus/ui/components/blocks/status-page-header";
import { Button } from "@openstatus/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@openstatus/ui/components/ui/sheet";
import { cn } from "@openstatus/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isTRPCClientError } from "@trpc/client";
import { useExtracted } from "next-intl";
import NextLink from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { usePathnamePrefix } from "../../hooks/use-pathname-prefix";
import { useTRPC } from "../../lib/trpc/client";
import { Link } from "../common/link";
import {
  type StatusUpdateType,
  StatusUpdates,
} from "../status-page/status-updates";
import { ThemeSwitcher } from "../themes/theme-switcher";

type Page = RouterOutputs["statusPage"]["get"];

function useNav() {
  const t = useExtracted();
  const pathname = usePathname();
  const prefix = usePathnamePrefix();

  return [
    {
      key: "status",
      label: t("Status"),
      href: `/${prefix}`,
      isActive: pathname === `/${prefix}`,
    },
    {
      key: "events",
      label: t("Events"),
      href: `${prefix ? `/${prefix}` : ""}/events`,
      isActive: pathname.startsWith(`${prefix ? `/${prefix}` : ""}/events`),
    },
  ];
}

function getStatusUpdateTypes(page: Page): StatusUpdateType[] {
  if (!page) return [];

  // NOTE: rss or json are not supported because of authentication
  if (page?.accessType === "email-domain") {
    return ["email"] as const;
  }

  return ["email", "telegram", "bale"] as const;
}

export function Header({
  className,
  ...props
}: React.ComponentProps<"header">) {
  const t = useExtracted();
  const trpc = useTRPC();
  const { domain } = useParams<{ domain: string }>();
  const { data: page } = useQuery({
    ...trpc.statusPage.get.queryOptions({ slug: domain }),
  });
  const prefix = usePathnamePrefix();

  const sendPageSubscriptionMutation = useMutation(
    trpc.emailRouter.sendPageSubscriptionVerification.mutationOptions({}),
  );

  const subscribeMutation = useMutation(
    trpc.statusPage.subscribe.mutationOptions({
      onSuccess: (data) => {
        if (!data?.id || !data?.token) return;
        sendPageSubscriptionMutation.mutate(
          { id: data.id, token: data.token },
          {
            onError: (error) => {
              if (isTRPCClientError(error)) {
                toast.error(error.message);
              } else {
                toast.error(t("Failed to subscribe"));
              }
            },
          },
        );
      },
    }),
  );

  return (
    <StatusPageHeader
      className={cn("group-data-[embed=true]/embed:hidden", className)}
      {...props}
    >
      <StatusPageHeaderContent className="max-w-3xl gap-2 px-4 py-4 sm:px-6">
        <StatusPageHeaderBrand className="w-auto md:min-w-36">
          <StatusPageHeaderBrandButton
            variant="ghost"
            className="h-11 w-auto gap-2 border-0 px-1 hover:bg-transparent"
          >
            <Link href={`/${prefix}`} aria-label="Noqte status">
              <span
                className="noqte-mark h-7 w-7 shrink-0"
                aria-hidden="true"
              />
              <span
                lang="fa"
                dir="rtl"
                className="noqte-wordmark text-xl font-bold"
              >
                نقطه
              </span>
              <span className="sr-only">{page?.title}</span>
            </Link>
          </StatusPageHeaderBrandButton>
        </StatusPageHeaderBrand>
        <NavDesktop className="hidden md:flex" />
        <StatusPageHeaderActions className="min-w-0 md:min-w-36">
          {page?.contactUrl ? (
            <StatusPageGetInTouchIcon>
              <a href={page.contactUrl} target="_blank" rel="noreferrer">
                <Chat />
                <span className="sr-only">{t("Get in touch")}</span>
              </a>
            </StatusPageGetInTouchIcon>
          ) : null}
          <StatusUpdates
            types={getStatusUpdateTypes(page)}
            onSubscribe={async (values) => {
              await subscribeMutation.mutateAsync({ slug: domain, ...values });
            }}
            page={page}
          />
          <ThemeSwitcher className="size-10 shrink-0" />
          <NavMobile className="md:hidden" />
        </StatusPageHeaderActions>
      </StatusPageHeaderContent>
    </StatusPageHeader>
  );
}

function NavDesktop({
  className,
  ...props
}: React.ComponentProps<typeof StatusPageHeaderNav>) {
  const nav = useNav();
  return (
    <StatusPageHeaderNav className={className} {...props}>
      {nav.map((item) => (
        <StatusPageHeaderNavItem
          key={item.key}
          isActive={item.isActive}
          className="min-h-11 px-3"
        >
          <NextLink href={item.href}>{item.label}</NextLink>
        </StatusPageHeaderNavItem>
      ))}
    </StatusPageHeaderNav>
  );
}

function NavMobile({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const t = useExtracted();
  const [open, setOpen] = useState(false);
  const nav = useNav();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          aria-label={t("Menu")}
          className={cn("size-11 border", className)}
          {...props}
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader className="border-b">
          <SheetTitle>{t("Menu")}</SheetTitle>
        </SheetHeader>
        <div className="px-1 pb-4">
          <ul className="flex flex-col gap-1">
            {nav.map((item) => {
              return (
                <li key={item.key} className="w-full">
                  <Button
                    variant={item.isActive ? "secondary" : "ghost"}
                    onClick={() => setOpen(false)}
                    className="w-full justify-start"
                    size="sm"
                    asChild
                  >
                    <NextLink href={item.href}>{item.label}</NextLink>
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
