/** 지금 켜진 운영 이벤트 (라우터가 DB 에서 주기적으로 갱신, 게임 로직은 eventOn 으로 확인) */
import type { CareerEventType } from "@shared/career/events";

let active = new Set<CareerEventType>();
export const eventOn = (t: CareerEventType) => active.has(t);
export function setActiveEvents(types: CareerEventType[]) { active = new Set(types); }
