// Typed client for the FastAPI backend (api/index.py).
export interface ChatReply { answer: string; topic: string | null; matched: boolean }
export interface Score { name: string; score: number }
export interface Message { name: string; contact: string; body: string; website: string }

export class ApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`api ${status}`);
    this.status = status;
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit | undefined = body === undefined ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
  const res = await fetch(path, init);
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as T;
}

export const api = {
  chat: (q: string) => call<ChatReply>("/api/chat", { q }),
  scores: () => call<Score[]>("/api/scores"),
  addScore: (name: string, score: number) => call<Score[]>("/api/scores", { name, score }),
  message: (m: Message) => call<{ ok: boolean }>("/api/messages", m),
};
