import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { createUserReport, listApprovedReports, listLatestSourceSnapshots, listPendingReports, moderateReport } from "./db";
import { analyzeLocation } from "./analysis";

const reportCategory = z.enum(["ruido", "iluminacao", "agua", "energia", "alagamento", "patrimonial"]);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  sources: router({
    latest: publicProcedure.query(async () => listLatestSourceSnapshots()),
  }),
  analysis: router({
    byLocation: publicProcedure
      .input(z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        radiusMeters: z.number().int().min(100).max(2000).optional(),
        mode: z.enum(["morar", "visitar"]).default("morar"),
      }))
      .query(({ input }) => analyzeLocation({ lat: input.latitude, lon: input.longitude }, input.radiusMeters, input.mode)),
  }),
  community: router({
    listApproved: publicProcedure.query(async () => listApprovedReports()),
    submit: publicProcedure
      .input(z.object({
        category: reportCategory,
        detail: z.string().trim().min(12).max(1200),
        addressApprox: z.string().trim().max(255).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        observedAt: z.string().datetime().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const created = await createUserReport({
          ...input,
          observedAt: input.observedAt ? new Date(input.observedAt) : null,
          addressApprox: input.addressApprox ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          createdByUserId: ctx.user?.id ?? null,
          status: "pending",
          confidence: "unreviewed",
        });
        return { ok: true, queued: true, reportId: created?.id ?? null };
      }),
  }),
  moderation: router({
    pending: adminProcedure.query(async () => listPendingReports()),
    decide: adminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        status: z.enum(["approved", "rejected", "contested"]),
        confidence: z.enum(["low", "medium", "high"]),
      }))
      .mutation(async ({ input }) => {
        const report = await moderateReport(input.id, input.status, input.confidence);
        return { ok: Boolean(report), report };
      }),
  }),
});

export type AppRouter = typeof appRouter;
