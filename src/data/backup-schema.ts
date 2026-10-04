/** Backup file schema. Loaded lazily by backup.ts so it never weighs on app start. */
import { array, literal, maxLength, number, strictObject } from 'zod/mini';
import { CardSchema, LessonProgressSchema, ProfileSchema } from '../shared/api.ts';

export const BackupSchema = strictObject({
  app: literal('aka-nihongo'),
  format: literal(1),
  exportedAt: number(),
  profile: ProfileSchema,
  cards: array(CardSchema).check(maxLength(20_000)),
  lessons: array(LessonProgressSchema).check(maxLength(200)),
});
