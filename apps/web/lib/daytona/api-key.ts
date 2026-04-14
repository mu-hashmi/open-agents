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
