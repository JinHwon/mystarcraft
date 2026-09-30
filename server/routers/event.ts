import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { createEvent, deleteEvent, getActiveEvents, getAllEvents, updateEvent } from "../db";
import { resetEventsCache } from "../career/router";

const EVENT_TYPES = ["exp_double", "fatigue_unlimited", "gold_double", "stat_boost"] as const;

/** 운영 이벤트 (경험치 2배 등). 커리어 모드는 career/events 의 eventOn 으로 확인한다 */
export const eventRouter = router({
  listAll: adminProcedure.query(() => getAllEvents()),

  /** 켜져 있고 지금 기간 안에 드는 이벤트 */
  listActive: publicProcedure.query(() => getActiveEvents()),

  create: adminProcedure
    .input(z.object({
      type: z.enum(EVENT_TYPES),
      name: z.string().trim().min(1).max(100),
      description: z.string().max(1000).optional(),
      isActive: z.boolean().optional(),
      startTime: z.date().optional(),
      endTime: z.date().optional(),
    }))
    .mutation(async ({ input }) => {
      await createEvent(input);
      resetEventsCache();
      return { success: true };
    }),

  update: adminProcedure
    .input(z.object({
      eventId: z.number().int(),
      isActive: z.boolean().optional(),
      startTime: z.date().optional(),
      endTime: z.date().optional(),
      name: z.string().trim().min(1).max(100).optional(),
      description: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input }) => {
      const { eventId, ...updates } = input;
      await updateEvent(eventId, updates);
      resetEventsCache();
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ eventId: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteEvent(input.eventId);
      resetEventsCache();
      return { success: true };
    }),
});
