// src/lib/axiosInstance.ts
import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
} from "axios";
import { getAuth } from "firebase/auth";
import { app } from "@/lib/firebase";

const isBrowser = typeof window !== "undefined";

// يحوّل أي شكل من الهيدرز إلى AxiosHeaders بدون الحاجة لـ RawAxiosHeaders
function ensureHeaders(h: unknown): AxiosHeaders {
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  return h instanceof AxiosHeaders ? h : new AxiosHeaders(h as any);
}

const instance = axios.create({
  // المتصفح = نفس الأصل. السيرفر = API_BASE_URL أو localhost
  baseURL: isBrowser ? "" : process.env.API_BASE_URL || "http://localhost:3000",
  withCredentials: false,
  timeout: 15000,
});

// --- Request Interceptor: يضيف Authorization إن وُجد مستخدم ---
instance.interceptors.request.use(async (config) => {
  const headers = ensureHeaders(config.headers);

  if (isBrowser && !headers.has("Authorization")) {
    const user = getAuth(app).currentUser;
    if (user) {
      const token = await user.getIdToken(); // current token
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  config.headers = headers;
  return config;
});

// --- Response Interceptor: ريفريش للتوكن مرة واحدة عند 401 ---
instance.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const cfg = (error.config || {}) as AxiosRequestConfig;
    const status = error.response?.status ?? 0;

    const headers = ensureHeaders(cfg.headers);

    if (status === 401 && !headers.has("x-retry-refresh")) {
      try {
        if (isBrowser) {
          const user = getAuth(app).currentUser;
          if (user) {
            const fresh = await user.getIdToken(true); // force refresh
            headers.set("Authorization", `Bearer ${fresh}`);
            headers.set("x-retry-refresh", "1");

            return instance.request({
              ...cfg,
              headers,
            });
          }
        }
      } catch {
        // ignore
      }
    }

    if (error.message === "Network Error") {
      console.error("Axios Network Error:", {
        url: cfg?.url,
        baseURL: cfg?.baseURL,
      });
    }

    return Promise.reject(error);
  }
);

export default instance;
