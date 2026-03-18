import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // 挨拶文メーカープロフィールカード
  profileCards: router({
    list: protectedProcedure.query(({ ctx }) =>
      db.getProfileCards(ctx.user.id)
    ),
    create: protectedProcedure
      .input(z.object({
        label: z.string().min(1).max(100),
        name: z.string().min(1).max(100),
        company: z.string().max(200).optional(),
        role: z.string().max(100).optional(),
        sortOrder: z.number().int().default(0),
      }))
      .mutation(({ ctx, input }) =>
        db.createProfileCard({ ...input, userId: ctx.user.id })
      ),
    update: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        label: z.string().min(1).max(100).optional(),
        name: z.string().min(1).max(100).optional(),
        company: z.string().max(200).optional(),
        role: z.string().max(100).optional(),
        sortOrder: z.number().int().optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateProfileCard(id, ctx.user.id, data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) =>
        db.deleteProfileCard(input.id, ctx.user.id)
      ),
  }),

  // 管理者用ルート
  admin: router({
    // 招待済みメールアドレス一覧
    allowedEmails: adminProcedure.query(() => db.getAllowedEmails()),
    // メールアドレスを招待
    inviteEmail: adminProcedure
      .input(z.object({ email: z.string().email().max(320) }))
      .mutation(({ ctx, input }) => db.addAllowedEmail(input.email, ctx.user.id)),
    // 招待を取り消し
    removeEmail: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ input }) => db.removeAllowedEmail(input.id)),
    // ユーザー一覧
    users: adminProcedure.query(() => db.getAllUsers()),
    // ユーザーの権限変更
    updateRole: adminProcedure
      .input(z.object({ userId: z.number().int(), role: z.enum(["user", "admin"]) }))
      .mutation(({ input }) => db.updateUserRole(input.userId, input.role)),
    // ユーザー削除
    deleteUser: adminProcedure
      .input(z.object({ userId: z.number().int() }))
      .mutation(({ input }) => db.deleteUser(input.userId)),
  }),
});

export type AppRouter = typeof appRouter;
