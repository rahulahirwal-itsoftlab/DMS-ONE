import axios from "axios";
import { clearApiCache } from "../utils/sessionApiCache";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true
});

export const API_ORIGIN = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");

export const fileUrl = (path, options = {}) => {
  if (!path || typeof path !== "string") return "";
  let normalized = String(path).trim().replaceAll("\\", "/");
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    if (normalized.includes("res.cloudinary.com") && normalized.includes("/upload/")) {
      if (!normalized.includes("/f_auto,q_auto")) {
        const transform = options.width
          ? `upload/f_auto,q_auto,w_${options.width},c_limit/`
          : "upload/f_auto,q_auto/";
        normalized = normalized.replace("/upload/", `/${transform}`);
      }
    }
    return normalized;
  }
  return `${API_ORIGIN}${normalized.startsWith("/") ? normalized : `/${normalized}`}`;
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("dms_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response.config?.method && response.config.method.toLowerCase() !== "get") clearApiCache();
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("dms_token");
      localStorage.removeItem("dms_user");
      window.dispatchEvent(new Event("dms_unauthorized"));
    }
    return Promise.reject(error);
  }
);
