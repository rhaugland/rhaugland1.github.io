import { createHmac, randomBytes } from "crypto";
import { cookies } from "next/headers";

const SECRET = process.env.TRACKER_AUTH_SECRET ?? "slushie-tracker-dev-secret";
const COOKIE_NAME = "tracker_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function sign(value: string): string {
  const sig = createHmac("sha256", SECRET).update(value).digest("hex").slice(0, 16);
  return `${value}.${sig}`;
}

function verify(signed: string): string | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  if (sign(value) !== signed) return null;
  return value;
}

// generate a human-readable temporary password
export function generateTempPassword(): string {
  const words = ["blend", "frost", "chill", "swirl", "berry", "peach", "mango", "grape", "melon", "plum"];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = randomBytes(2).readUInt16BE(0) % 9000 + 1000; // 4-digit number
  return `${word}-${num}`;
}

// set the auth cookie after successful login
export async function setTrackerSession(slug: string, email: string): Promise<void> {
  const value = sign(`${slug}:${email}`);
  const jar = await cookies();
  jar.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

// verify the auth cookie and return { slug, email } or null
export async function getTrackerSession(): Promise<{ slug: string; email: string } | null> {
  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME)?.value;
  if (!cookie) return null;

  const value = verify(cookie);
  if (!value) return null;

  const colonIdx = value.indexOf(":");
  if (colonIdx === -1) return null;

  return {
    slug: value.slice(0, colonIdx),
    email: value.slice(colonIdx + 1),
  };
}

// verify a request's cookie matches a specific slug
export async function verifyTrackerAccess(slug: string): Promise<boolean> {
  const session = await getTrackerSession();
  return session?.slug === slug;
}
