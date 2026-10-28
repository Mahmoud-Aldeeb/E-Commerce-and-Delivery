import axios, { isAxiosError } from "axios";

const isServer = typeof window === "undefined";

// Both variables hold the backend origin only (no trailing slash, no /api).
// The browser only sees NEXT_PUBLIC_* variables; the server can also read API_URL.
const origin = isServer
  ? (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL)
  : process.env.NEXT_PUBLIC_API_URL;

const api = axios.create({
  baseURL: `${origin}/api`,
  timeout: 15_000, // a slow API must never hang a server render
});

// Inject the JWT token (browser only: the token lives in localStorage)
api.interceptors.request.use((config) => {
  if (!isServer) {
    const token = localStorage.getItem("auth_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!isServer && isAxiosError(error)) {
      const status = error.response?.status;

      // Expired or invalid session: clear it and send the user to the login page
      if (status === 401) {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");

        const { pathname, search } = window.location;
        const onAuthPage =
          pathname.includes("/login") || pathname.includes("/register");

        if (!onAuthPage) {
          // The login page reads ?redirect= and brings the user back afterwards
          // const redirect = encodeURIComponent(pathname + search);
          // window.location.href = `/login?redirect=${redirect}`;

          const loginUrl = new URL("/login", window.location.origin);
          loginUrl.searchParams.set("redirect", pathname + search);
          window.location.assign(loginUrl.toString());
        }
      }

      // The API rate limiter answered. providers.tsx listens and shows one toast
      if (status === 429) {
        window.dispatchEvent(new CustomEvent("api:rate-limited"));
      }
    }

    return Promise.reject(error);
  },
);

// The HTTP status of a failed request (undefined when the server was unreachable)
export function getErrorStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

// Turns any thrown error into a message that is safe to show to the user.
// The API always answers errors with { message: string }.
export function getErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === "string" && message) return message;
    if (Array.isArray(message) && message.length > 0) return String(message[0]);
    if (!error.response)
      return "Cannot reach the server. Check your connection.";
  }
  return fallback;
}

export default api;
