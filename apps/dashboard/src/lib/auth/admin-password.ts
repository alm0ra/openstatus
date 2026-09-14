import { scrypt, timingSafeEqual } from "node:crypto";

export async function verifyAdminPassword(
  password: unknown,
  encoded: string | undefined,
): Promise<boolean> {
  if (typeof password !== "string" || password.length > 256 || !encoded) {
    return false;
  }
  const parts = encoded.split(":");
  if (
    parts.length !== 3 ||
    parts[0] !== "scrypt" ||
    !/^[a-f0-9]{64}$/.test(parts[1] ?? "") ||
    !/^[a-f0-9]{128}$/.test(parts[2] ?? "")
  ) {
    return false;
  }
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      Buffer.from(parts[1], "hex"),
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
  });
  return timingSafeEqual(key, Buffer.from(parts[2], "hex"));
}
