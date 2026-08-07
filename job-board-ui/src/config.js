export const API_BASE_URL =
  window?.configs?.apiUrl ||
  import.meta.env.VITE_API_BASE_URL ||
  "/api";