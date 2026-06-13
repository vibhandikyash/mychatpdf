export interface ApiClientOptions {
  baseUrl?: string;
  getToken?: () => Promise<string | null>;
  fetcher?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getToken?: () => Promise<string | null>;
  private readonly fetcher: typeof fetch;

  constructor({ baseUrl = "/api", getToken, fetcher = fetch }: ApiClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.getToken = getToken;
    this.fetcher = fetcher;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetch(path, init);

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async requestText(path: string, init: RequestInit = {}): Promise<string> {
    const response = await this.fetch(path, init);
    return response.text();
  }

  private async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getToken?.();
    const headers = new Headers(init.headers);

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers
    });

    if (!response.ok) {
      throw new ApiError(response.statusText || "Request failed", response.status);
    }

    return response;
  }
}

export function createAuthenticatedApiClient(getToken: () => Promise<string | null>) {
  return new ApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api",
    getToken
  });
}
