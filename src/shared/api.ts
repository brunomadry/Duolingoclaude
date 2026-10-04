/**
 * Records exchanged between the client and the Worker, with strict schemas.
 * Uses `zod/mini` with named imports so bundlers can tree-shake it: the client
 * loads these lazily to validate backup files, and the Worker validates every
 * request body with them. Other client code must import types only.
 *
 * Timestamps are epoch milliseconds. `updatedAt` is the client clock and drives
 * last-write-wins; `syncedAt` is the server clock and drives incremental pulls.
 */
import {
  array,
  boolean,
  discriminatedUnion,
  enum as zEnum,
  int,
  literal,
  maxLength,
  maximum,
  minLength,
  minimum,
  nonnegative,
  nullable,
  number,
  optional,
  partial,
  record,
  regex,
  strictObject,
  string,
  trim,
  unknown,
  type infer as Infer,
} from 'zod/mini';
import { AVATAR_IDS } from './avatars.ts';
import { MAX_NAME_LENGTH, MAX_SYNC_BATCH } from './defaults.ts';

const epochMs = int().check(nonnegative());
const uuid = string().check(regex(/^[0-9a-f-]{36}$/i, 'expected a UUID'));
const text = (min: number, max: number) => string().check(minLength(min), maxLength(max));

export const ProfileSettingsSchema = strictObject({
  pace: zEnum(['daily', 'relaxed']),
  theme: zEnum(['dark', 'light']),
  romaji: zEnum(['auto', 'always', 'never']),
  sound: boolean(),
  /** IANA zone used for "local midnight" unlocking, captured when the profile is created. */
  timeZone: text(1, 64),
});
export type ProfileSettings = Infer<typeof ProfileSettingsSchema>;

const profileName = string().check(trim(), minLength(1), maxLength(MAX_NAME_LENGTH));
const avatar = zEnum(AVATAR_IDS);

export const ProfileSchema = strictObject({
  id: uuid,
  name: profileName,
  avatar,
  settings: ProfileSettingsSchema,
  createdAt: epochMs,
  updatedAt: epochMs,
  deletedAt: nullable(epochMs),
});
export type ProfileRecord = Infer<typeof ProfileSchema>;

export const ProfilePatchSchema = strictObject({
  name: optional(profileName),
  avatar: optional(avatar),
  settings: optional(partial(ProfileSettingsSchema)),
  updatedAt: epochMs,
});
export type ProfilePatch = Infer<typeof ProfilePatchSchema>;

/** One SRS card. `data` is the scheduler state (opaque to the server, max 4 KB). */
export const CardSchema = strictObject({
  profileId: uuid,
  cardId: text(1, 120),
  data: record(string(), unknown()),
  updatedAt: epochMs,
  deleted: boolean(),
});
export type CardRecord = Infer<typeof CardSchema>;

export const LessonProgressSchema = strictObject({
  profileId: uuid,
  n: int().check(minimum(1), maximum(100)),
  completedAt: epochMs,
  /** Quiz score 0..1 from the summary step. Never affects unlocking. */
  score: nullable(number().check(minimum(0), maximum(1))),
  updatedAt: epochMs,
});
export type LessonProgressRecord = Infer<typeof LessonProgressSchema>;

export const ChangeSchema = discriminatedUnion('kind', [
  strictObject({ kind: literal('profile'), record: ProfileSchema }),
  strictObject({ kind: literal('card'), record: CardSchema }),
  strictObject({ kind: literal('lesson'), record: LessonProgressSchema }),
]);
export type Change = Infer<typeof ChangeSchema>;

export const SyncRequestSchema = strictObject({
  changes: array(ChangeSchema).check(maxLength(MAX_SYNC_BATCH)),
});
export type SyncRequest = Infer<typeof SyncRequestSchema>;

export interface SyncResponse {
  serverTime: number;
  applied: number;
  ignored: number;
}

export interface StateResponse {
  serverTime: number;
  profile: ProfileRecord;
  cards: CardRecord[];
  lessons: LessonProgressRecord[];
}

export interface ProfilesResponse {
  serverTime: number;
  profiles: ProfileRecord[];
}

export const UnlockRequestSchema = strictObject({ code: text(1, 200) });

export const ReportSchema = strictObject({
  id: uuid,
  profileId: nullable(uuid),
  lessonN: nullable(int().check(minimum(1), maximum(100))),
  /** The offending text (Japanese sentence, gloss, note excerpt). */
  sentence: text(0, 1000),
  note: text(0, 2000),
  /** Where in the app the report came from, e.g. "settings", "lesson:vocab". */
  context: text(0, 200),
  createdAt: epochMs,
});
export type ReportRecord = Infer<typeof ReportSchema>;

export type ApiErrorCode =
  'locked' | 'bad_request' | 'not_found' | 'gone' | 'rate_limited' | 'too_large' | 'server_error';

export interface ApiError {
  error: ApiErrorCode;
  message?: string;
}
