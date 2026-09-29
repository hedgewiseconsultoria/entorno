import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, InsertUserReport, InsertSourcePayload, InsertSourceSnapshot, UserReport, sourcePayloads, sourceSnapshots, userReports, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); }
    catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function createUserReport(report: InsertUserReport): Promise<UserReport | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(userReports).values(report);
  const id = Number(result[0].insertId);
  const rows = await db.select().from(userReports).where(eq(userReports.id, id)).limit(1);
  return rows[0];
}

export async function listApprovedReports() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userReports).where(eq(userReports.status, "approved")).orderBy(desc(userReports.createdAt)).limit(100);
}

export async function listPendingReports() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userReports).where(eq(userReports.status, "pending")).orderBy(desc(userReports.createdAt)).limit(100);
}

export async function moderateReport(id: number, status: "approved" | "rejected" | "contested", confidence: "low" | "medium" | "high") {
  const db = await getDb();
  if (!db) return undefined;
  await db.update(userReports).set({ status, confidence, updatedAt: new Date() }).where(eq(userReports.id, id));
  const rows = await db.select().from(userReports).where(eq(userReports.id, id)).limit(1);
  return rows[0];
}

export async function createSourceSnapshot(snapshot: InsertSourceSnapshot) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(sourceSnapshots).values(snapshot);
  const id = Number(result[0].insertId);
  const rows = await db.select().from(sourceSnapshots).where(eq(sourceSnapshots.id, id)).limit(1);
  return rows[0];
}

export async function upsertSourcePayload(payload: InsertSourcePayload) {
  const db = await getDb();
  if (!db) return undefined;
  await db.insert(sourcePayloads).values(payload).onDuplicateKeyUpdate({
    set: {
      sourceName: payload.sourceName,
      format: payload.format,
      sourceUrl: payload.sourceUrl,
      fetchedAt: payload.fetchedAt,
      rowCount: payload.rowCount,
      checksum: payload.checksum,
      payload: payload.payload,
    },
  });
  const rows = await db.select().from(sourcePayloads).where(eq(sourcePayloads.sourceSlug, payload.sourceSlug)).limit(1);
  return rows[0];
}

export async function getSourcePayload(sourceSlug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(sourcePayloads).where(eq(sourcePayloads.sourceSlug, sourceSlug)).limit(1);
  return rows[0];
}

export async function listLatestSourceSnapshots() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sourceSnapshots).orderBy(desc(sourceSnapshots.fetchedAt)).limit(50);
}
