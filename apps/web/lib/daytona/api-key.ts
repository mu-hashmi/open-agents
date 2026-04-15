import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/crypto";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

/**
 * Return the decrypted Daytona API key for a user, if one is configured.
 */
export async function getUserDaytonaApiKey(
  userId: string,
): Promise<string | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { daytonaApiKey: true },
  });

  if (!user?.daytonaApiKey) {
    return null;
  }

  return decrypt(user.daytonaApiKey);
}

/**
 * Persist a Daytona API key using the shared encryption helper.
 */
export async function setUserDaytonaApiKey(
  userId: string,
  apiKey: string,
): Promise<void> {
  await db
    .update(users)
    .set({
      daytonaApiKey: encrypt(apiKey),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Remove the stored Daytona API key for a user.
 */
export async function deleteUserDaytonaApiKey(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      daytonaApiKey: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Check whether a user has a Daytona API key saved.
 */
export async function hasUserDaytonaApiKey(userId: string): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { daytonaApiKey: true },
  });

  return Boolean(user?.daytonaApiKey);
}

/**
 * Return the encrypted Daytona API URL for a user, if one is configured.
 * The URL is stored encrypted because it may contain auth tokens in self-hosted setups.
 */
export async function getUserDaytonaApiUrl(
  userId: string,
): Promise<string | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { daytonaApiUrl: true },
  });

  if (!user?.daytonaApiUrl) {
    return null;
  }

  return decrypt(user.daytonaApiUrl);
}

/**
 * Persist a custom Daytona API URL for self-hosted instances.
 */
export async function setUserDaytonaApiUrl(
  userId: string,
  apiUrl: string,
): Promise<void> {
  await db
    .update(users)
    .set({
      daytonaApiUrl: encrypt(apiUrl),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Remove the stored Daytona API URL for a user (reverts to default cloud).
 */
export async function deleteUserDaytonaApiUrl(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      daytonaApiUrl: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export interface DaytonaCredentials {
  apiKey: string;
  apiUrl?: string;
}

/**
 * Return both the API key and optional API URL for a user.
 */
export async function getUserDaytonaCredentials(
  userId: string,
): Promise<DaytonaCredentials | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { daytonaApiKey: true, daytonaApiUrl: true },
  });

  if (!user?.daytonaApiKey) {
    return null;
  }

  return {
    apiKey: decrypt(user.daytonaApiKey),
    apiUrl: user.daytonaApiUrl ? decrypt(user.daytonaApiUrl) : undefined,
  };
}
