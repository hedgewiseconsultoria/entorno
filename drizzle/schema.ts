import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, double, longtext } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const sourceSnapshots = mysqlTable("source_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  sourceSlug: varchar("sourceSlug", { length: 80 }).notNull(),
  sourceName: varchar("sourceName", { length: 180 }).notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  status: mysqlEnum("status", ["ok", "warning", "error", "manual"]).default("manual").notNull(),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  rowCount: int("rowCount"),
  httpStatus: int("httpStatus"),
  checksum: varchar("checksum", { length: 128 }),
  metadata: text("metadata"),
});

export const sourcePayloads = mysqlTable("source_payloads", {
  id: int("id").autoincrement().primaryKey(),
  sourceSlug: varchar("sourceSlug", { length: 80 }).notNull().unique(),
  sourceName: varchar("sourceName", { length: 180 }).notNull(),
  format: mysqlEnum("format", ["geojson", "csv", "json"]).notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  rowCount: int("rowCount"),
  checksum: varchar("checksum", { length: 128 }).notNull(),
  payload: longtext("payload").notNull(),
});

export const userReports = mysqlTable("user_reports", {
  id: int("id").autoincrement().primaryKey(),
  category: mysqlEnum("category", ["ruido", "iluminacao", "agua", "energia", "alagamento", "patrimonial"]).notNull(),
  detail: text("detail").notNull(),
  addressApprox: varchar("addressApprox", { length: 255 }),
  latitude: double("latitude"),
  longitude: double("longitude"),
  observedAt: timestamp("observedAt"),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "contested"]).default("pending").notNull(),
  confidence: mysqlEnum("confidence", ["unreviewed", "low", "medium", "high"]).default("unreviewed").notNull(),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type SourceSnapshot = typeof sourceSnapshots.$inferSelect;
export type InsertSourceSnapshot = typeof sourceSnapshots.$inferInsert;
export type SourcePayload = typeof sourcePayloads.$inferSelect;
export type InsertSourcePayload = typeof sourcePayloads.$inferInsert;
export type UserReport = typeof userReports.$inferSelect;
export type InsertUserReport = typeof userReports.$inferInsert;
