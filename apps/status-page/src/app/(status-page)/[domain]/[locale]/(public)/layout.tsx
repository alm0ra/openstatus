import {
  StatusPageMain,
  StatusPageShell,
} from "@openstatus/ui/components/blocks/status-page-shell";
import { Suspense } from "react";

import { EmbedShell } from "../../../../../components/layout/embed-shell";
import { Footer } from "../../../../../components/nav/footer";
import { Header } from "../../../../../components/nav/header";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <EmbedShell>
        <StatusPageShell className="noqte-status-shell gap-0 group-data-[embed=true]/embed:min-h-0">
          <Header className="bg-background/95 w-full border-b" />
          <StatusPageMain className="max-w-3xl px-4 py-8 group-data-[embed=true]/embed:mx-0 group-data-[embed=true]/embed:max-w-none group-data-[embed=true]/embed:p-0 sm:px-6 sm:py-12">
            {children}
          </StatusPageMain>
          <Footer className="w-full border-t" />
        </StatusPageShell>
      </EmbedShell>
    </Suspense>
  );
}
