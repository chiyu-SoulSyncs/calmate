import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, profileCards, InsertProfileCard, googleTokens, InsertGoogleToken } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Google Tokens CRUD

export async function getGoogleToken(userId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(googleTokens).where(eq(googleTokens.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function upsertGoogleToken(data: { userId: string; accessToken: string; refreshToken?: string; expiresAt: number }) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert google token: database not available");
    return;
  }
  await db.insert(googleTokens).values({
    userId: data.userId,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? null,
    expiresAt: data.expiresAt,
  }).onDuplicateKeyUpdate({
    set: {
      accessToken: data.accessToken,
      ...(data.refreshToken !== undefined ? { refreshToken: data.refreshToken } : {}),
      expiresAt: data.expiresAt,
    },
  });
}

export async function deleteGoogleToken(userId: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(googleTokens).where(eq(googleTokens.userId, userId));
}

export async function getProfileCards(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(profileCards).where(eq(profileCards.userId, userId));
}

export async function createProfileCard(data: InsertProfileCard) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(profileCards).values(data);
  return result[0].insertId;
}

export async function updateProfileCard(id: number, userId: number, data: Partial<InsertProfileCard>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(profileCards).set(data).where(and(eq(profileCards.id, id), eq(profileCards.userId, userId)));
}

export async function deleteProfileCard(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(profileCards).where(and(eq(profileCards.id, id), eq(profileCards.userId, userId)));
}
