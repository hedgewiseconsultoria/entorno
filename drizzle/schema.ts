export type UserRole = "user" | "admin";
export type ReportCategory = "ruido" | "iluminacao" | "agua" | "energia" | "alagamento" | "patrimonial";
export type ReportStatus = "pending" | "approved" | "rejected" | "contested";
export type ReportConfidence = "unreviewed" | "low" | "medium" | "high";
export type SourceFormat = "geojson" | "csv" | "json";
export type SnapshotStatus = "ok" | "warning" | "error" | "manual";

export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

export type InsertUser = Partial<Omit<User, "id" | "createdAt" | "updatedAt">> & Pick<User, "openId">;

export type SourceSnapshot = {
  id: number;
  sourceSlug: string;
  sourceName: string;
  sourceUrl: string;
  status: SnapshotStatus;
  fetchedAt: Date;
  rowCount: number | null;
  httpStatus: number | null;
  checksum: string | null;
  metadata: string | null;
};

export type InsertSourceSnapshot = Omit<SourceSnapshot, "id" | "rowCount" | "httpStatus" | "checksum"> & Partial<Pick<SourceSnapshot, "rowCount" | "httpStatus" | "checksum">>;

export type SourcePayload = {
  id: number;
  sourceSlug: string;
  sourceName: string;
  format: SourceFormat;
  sourceUrl: string;
  fetchedAt: Date;
  rowCount: number | null;
  checksum: string;
  payload: string;
};

export type InsertSourcePayload = Omit<SourcePayload, "id">;

export type UserReport = {
  id: number;
  category: ReportCategory;
  detail: string;
  addressApprox: string | null;
  latitude: number | null;
  longitude: number | null;
  observedAt: Date | null;
  status: ReportStatus;
  confidence: ReportConfidence;
  createdByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InsertUserReport = Omit<UserReport, "id" | "createdAt" | "updatedAt">;
