// API 요청 검증용 zod 스키마 (서버 라우트에서만 사용). 프론트가 보내는 ClientState 의 일부를 받는다.
import { z } from "zod";
import { isDateString } from "./dates";
import type { ClientState } from "./types";
import { EMPTY_CLIENT_STATE, STEP_IDS } from "./types";

const id = z.string().max(40);

export const ChangeAlertSchema = z.object({
  id,
  eventIds: z.array(id).max(30),
  stepId: z.enum(STEP_IDS).nullable(),
  title: z.string().max(200),
  before: z.string().max(500),
  after: z.string().max(500),
  status: z.enum(["시행", "추진 중"]),
  source: z.string().max(300),
  guidelineId: z.string().max(40),
  confirmed: z.boolean(),
  publishedAt: z.string().refine(isDateString).optional(),
  url: z.string().max(500).optional(),
});

export const StateSchema = z.object({
  stepStatus: z.record(z.string().max(20), z.partialRecord(z.enum(STEP_IDS), z.enum(["todo", "done"]))).default({}),
  eventDateOverrides: z
    .record(z.string().max(20), z.string().refine(isDateString, "YYYY-MM-DD 형식이어야 해요"))
    .default({}),
  extraNotes: z
    .record(
      z.string().max(20),
      z
        .array(
          z.object({
            id: z.string().max(80).optional(),
            year: z.number(),
            note: z.string().max(500),
            author: z.string().max(40).optional(),
            stepId: z.enum(STEP_IDS).optional(),
            important: z.boolean().optional(),
          }),
        )
        .max(50),
    )
    .default({}),
  confirmedChangeIds: z.array(z.string().max(40)).max(50).default([]),
  addedChanges: z.array(ChangeAlertSchema).max(20).optional(),
});

/** 검증된 요청 state → ClientState (addedEvents 는 받지 않음) */
export function toClientState(s: z.infer<typeof StateSchema> | undefined): ClientState {
  return s ? { ...EMPTY_CLIENT_STATE, ...s } : EMPTY_CLIENT_STATE;
}
