import { router } from "../_core/trpc";
import { careerRouter } from "../career/router";
import { rookieRouter } from "../rookie/router";
import { adminRouter } from "./admin";
import { authRouter } from "./auth";
import { eventRouter } from "./event";

// 헬스체크는 tRPC 가 아니라 Express 의 GET /api/health
export const appRouter = router({
  auth: authRouter,
  admin: adminRouter,
  event: eventRouter,
  career: careerRouter,
  rookie: rookieRouter,
});

export type AppRouter = typeof appRouter;
