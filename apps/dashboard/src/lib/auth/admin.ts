import { and, db, eq, isNull } from "@openstatus/db";
import { user } from "@openstatus/db/src/schema";
import Credentials from "next-auth/providers/credentials";

import { verifyAdminPassword } from "./admin-password";

export const adminLoginEnabled = process.env.AUTH_ADMIN_ENABLED === "true";

let attemptWindow = 0;
let attempts = 0;

export const AdminProvider = Credentials({
  name: "ورود مدیر",
  credentials: {
    username: { label: "نام کاربری", type: "text", autoComplete: "username" },
    password: {
      label: "رمز عبور",
      type: "password",
      autoComplete: "current-password",
    },
  },
  async authorize(credentials) {
    if (!adminLoginEnabled) return null;
    const now = Date.now();
    if (now - attemptWindow >= 60_000) {
      attemptWindow = now;
      attempts = 0;
    }
    if (++attempts > 10) return null;
    const validPassword = await verifyAdminPassword(
      credentials.password,
      process.env.AUTH_ADMIN_PASSWORD_HASH,
    );
    if (!validPassword || credentials.username !== "admin") return null;
    const id = Number(process.env.AUTH_ADMIN_USER_ID);
    if (!Number.isSafeInteger(id) || id < 1) return null;
    const admin = await db
      .select()
      .from(user)
      .where(and(eq(user.id, id), isNull(user.deletedAt)))
      .get();
    if (!admin) return null;
    return { ...admin, id: String(admin.id) };
  },
});
