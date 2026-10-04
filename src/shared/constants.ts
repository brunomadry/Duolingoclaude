/**
 * App-wide constants shared by the client, the Worker and scripts.
 * The working title lives here and only here, so renaming is a one-line change.
 */
export const APP_NAME = 'Aka Nihongo';
export const APP_SHORT_NAME = 'Aka';
export const APP_DESCRIPTION = 'Prywatna nauka japońskiego dla dwóch osób.';

export const TOTAL_LESSONS = 100;
export const TEST_EVERY = 7;
/** First lesson with the AI conversation step. */
export const CHAT_FROM_LESSON = 17;
/** Last lesson where "auto" romaji is visible by default. */
export const ROMAJI_AUTO_UNTIL = 16;
/** New words per lesson (the brief: 5 to 7; kana lessons use fewer). */
export const MAX_WORDS_PER_LESSON = 7;
/** Last lesson of the writing phase (kana only). */
export const KANA_PHASE_END = 16;
/** Time zone used when a profile has none (and in tests). */
export const DEFAULT_TIME_ZONE = 'Europe/Warsaw';
