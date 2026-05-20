import axios from "axios";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "/api"
    : "http://localhost:8000/api");

// withCredentials обязателен для отправки httpOnly cookie к API
const api = axios.create({ baseURL: API_URL, withCredentials: true });

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("businessId");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;