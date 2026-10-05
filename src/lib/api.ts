/** Thin fetch wrapper for /api. Errors are typed so callers can react to "locked" and "offline". */
import type { AiChatResponse, AiExerciseResponse, ChatTurn } from '../shared/ai.ts';
import type {
  ApiErrorCode,
  Change,
  ProfileRecord,
  ProfilesResponse,
  ReportRecord,
  StateResponse,
  SyncResponse,
} from '../shared/api.ts';

export class ApiError extends Error {
  readonly code: ApiErrorCode | 'offline';
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(
    code: ApiErrorCode | 'offline',
    status: number,
    retryAfterSeconds: number | null = null,
  ) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type Fetch = typeof fetch;

export function createApi(fetchImpl: Fetch = (...args) => fetch(...args)) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('offline', 0);
    }
    if (!res.ok) {
      let code: ApiErrorCode = 'server_error';
      try {
        const data = (await res.json()) as { error?: ApiErrorCode };
        if (data.error) code = data.error;
      } catch {
        // Non-JSON error (e.g. a proxy page): keep server_error.
      }
      const retry = Number(res.headers.get('retry-after'));
      throw new ApiError(code, res.status, Number.isFinite(retry) && retry > 0 ? retry : null);
    }
    return (await res.json()) as T;
  }

  return {
    unlock: (code: string) => request<{ ok: true }>('POST', '/unlock', { code }),
    session: () => request<{ ok: true }>('GET', '/session'),
    listProfiles: () => request<ProfilesResponse>('GET', '/profiles'),
    putProfile: (p: ProfileRecord) => request<ProfileRecord>('POST', '/profiles', p),
    deleteProfile: (id: string) => request<{ ok: true }>('DELETE', `/profiles/${id}`),
    pullState: (id: string, since: number) =>
      request<StateResponse>('GET', `/profiles/${id}/state?since=${since}`),
    pushChanges: (id: string, changes: Change[]) =>
      request<SyncResponse>('POST', `/profiles/${id}/sync`, { changes }),
    sendReport: (r: ReportRecord) => request<{ ok: true }>('POST', '/reports', r),
    aiExercise: (lesson: number) => request<AiExerciseResponse>('POST', '/ai/exercise', { lesson }),
    aiChat: (lesson: number, history: readonly ChatTurn[]) =>
      request<AiChatResponse>('POST', '/ai/chat', { lesson, history }),
  };
}

export type Api = ReturnType<typeof createApi>;
