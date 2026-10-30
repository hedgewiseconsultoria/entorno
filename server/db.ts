import type {
  InsertSourcePayload,
  InsertSourceSnapshot,
  InsertUser,
  InsertUserReport,
  ReportConfidence,
  ReportStatus,
  SourcePayload,
  SourceSnapshot,
  User,
  UserReport,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

const users = new Map<string, User>();
const reports: UserReport[] = [];
const sourcePayloads = new Map<string, SourcePayload>();
const sourceSnapshots: SourceSnapshot[] = [];
let nextUserId = 1;
let nextReportId = 1;
let nextSourceId = 1;

function now() { return new Date(); }

export async function getDb() {
  return null;
}

export async function upsertUser(input: InsertUser): Promise<void> {
  const existing = users.get(input.openId);
  const timestamp = now();
  const user: User = {
    id: existing?.id ?? nextUserId++,
    openId: input.openId,
    name: input.name ?? existing?.name ?? null,
    email: input.email ?? existing?.email ?? null,
    loginMethod: input.loginMethod ?? existing?.loginMethod ?? null,
    role: input.role ?? (input.openId === ENV.ownerOpenId ? "admin" : existing?.role ?? "user"),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    lastSignedIn: input.lastSignedIn ?? timestamp,
  };
  users.set(user.openId, user);
}

export async function getUserByOpenId(openId: string) {
  return users.get(openId);
}

export async function createUserReport(input: InsertUserReport): Promise<UserReport> {
  const timestamp = now();
  const report: UserReport = { id: nextReportId++, ...input, createdAt: timestamp, updatedAt: timestamp };
  reports.unshift(report);
  return report;
}

export async function listApprovedReports() {
  return reports.filter((report) => report.status === "approved").slice(0, 100);
}

export async function listPendingReports() {
  return reports.filter((report) => report.status === "pending").slice(0, 100);
}

export async function moderateReport(id: number, status: ReportStatus, confidence: Exclude<ReportConfidence, "unreviewed">) {
  const report = reports.find((item) => item.id === id);
  if (!report) return undefined;
  report.status = status;
  report.confidence = confidence;
  report.updatedAt = now();
  return report;
}

export async function createSourceSnapshot(input: InsertSourceSnapshot) {
  const snapshot: SourceSnapshot = {
    id: nextSourceId++,
    sourceSlug: input.sourceSlug,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    status: input.status ?? "manual",
    fetchedAt: input.fetchedAt,
    rowCount: input.rowCount ?? null,
    httpStatus: input.httpStatus ?? null,
    checksum: input.checksum ?? null,
    metadata: input.metadata ?? null,
  };
  sourceSnapshots.unshift(snapshot);
  sourceSnapshots.splice(50);
  return snapshot;
}

export async function upsertSourcePayload(input: InsertSourcePayload) {
  const payload: SourcePayload = { id: sourcePayloads.get(input.sourceSlug)?.id ?? nextSourceId++, ...input };
  sourcePayloads.set(payload.sourceSlug, payload);
  return payload;
}

export async function getSourcePayload(sourceSlug: string) {
  return sourcePayloads.get(sourceSlug);
}

export async function listLatestSourceSnapshots() {
  return sourceSnapshots.slice(0, 50);
}

export function getCacheState() {
  return {
    payloads: Array.from(sourcePayloads.values()),
    snapshots: sourceSnapshots.slice(),
    users: users.size,
    reports: reports.length,
  };
}
