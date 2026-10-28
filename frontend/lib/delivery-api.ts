import axios from "axios";

// The delivery portal has its own session, separate from the customer's one
export const DELIVERY_TOKEN_KEY = "delivery_token";
export const DELIVERY_PARTNER_KEY = "delivery_partner";

const deliveryApi = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL}/api`,
  timeout: 15_000,
});

deliveryApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(DELIVERY_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

deliveryApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const isLoginRequest = String(error.config?.url ?? "").includes(
      "/delivery/login",
    );

    // 401: the token expired or is invalid. 403: the account was deactivated.
    // A failed login is not a lost session: the form shows its own message.
    if ((status === 401 || status === 403) && !isLoginRequest) {
      localStorage.removeItem(DELIVERY_TOKEN_KEY);
      localStorage.removeItem(DELIVERY_PARTNER_KEY);

      if (!window.location.pathname.startsWith("/delivery/login")) {
        const reason = status === 403 ? "blocked" : "expired";
        // window.location.href = `/delivery/login?reason=${reason}`;

        window.location.href = new URL(
          `/delivery/login?reason=${reason}`,
          window.location.origin,
        ).toString();
      }
    }

    // The API rate limiter answered: providers.tsx shows one toast for it
    if (status === 429) {
      window.dispatchEvent(new CustomEvent("api:rate-limited"));
    }

    return Promise.reject(error);
  },
);

export default deliveryApi;
