import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getUserById, isConfiguredAdmin, updateUserRole } from "../db";

/** 사용자 계정 관리 (커리어 세이브 관리는 career.admin* 에 있음) */
export const adminRouter = router({
  updateUserRole: adminProcedure
    .input(z.object({ userId: z.number().int(), role: z.enum(["admin", "user"]) }))
    .mutation(async ({ ctx, input }) => {
      if (input.role === "user") {
        // 관리자가 모두 사라지는 실수를 막는다
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "자기 자신의 관리자 권한은 해제할 수 없습니다" });
        }
        const target = await getUserById(input.userId);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "사용자를 찾을 수 없습니다" });
        if (isConfiguredAdmin(target.openId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "서버 설정(ADMIN_USERNAMES)으로 지정된 관리자는 해제할 수 없습니다" });
        }
      }
      await updateUserRole(input.userId, input.role);
      return { success: true };
    }),
});
