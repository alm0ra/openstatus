import type React from "react";
import { render } from "react-email";
import { Resend } from "resend";

import { env } from "./env";

export const resend = env.RESEND_API_KEY
  ? new Resend(env.RESEND_API_KEY)
  : null;

function requireResend() {
  if (!resend) throw new Error("Email delivery is not configured");
  return resend;
}

export interface Emails {
  react: React.JSX.Element;
  subject: string;
  to: string[];
  from: string;
  reply_to?: string;
}

export type EmailHtml = {
  html: string;
  subject: string;
  to: string;
  from: string;
  reply_to?: string;
};
export const sendEmail = async (email: Emails) => {
  if (env.NODE_ENV !== "production") return;
  await requireResend().emails.send(email);
};

export const sendBatchEmailHtml = async (emails: EmailHtml[]) => {
  if (env.NODE_ENV !== "production") return;
  await requireResend().batch.send(emails);
};

// TODO: delete in favor of sendBatchEmailHtml
export const sendEmailHtml = async (emails: EmailHtml[]) => {
  if (env.NODE_ENV !== "production") return;
  requireResend();

  await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify(emails),
  });
};

export const sendWithRender = async (email: Emails) => {
  if (env.NODE_ENV !== "production") return;
  const client = requireResend();
  const html = await render(email.react);
  await client.emails.send({
    ...email,
    html,
  });
};
