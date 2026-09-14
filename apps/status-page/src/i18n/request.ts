import { getRequestConfig } from "next-intl/server";
import { headers } from "next/headers";

import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale =
    (await requestLocale) ??
    (await headers()).get("x-noqte-locale") ??
    undefined;

  if (!locale || !(routing.locales as readonly string[]).includes(locale)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
