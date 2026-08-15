export const API_BASE_URL = import.meta.env.DEV
  ? import.meta.env.VITE_API_BASE_URL || "/api"
  : window?.configs?.apiUrl ||
    import.meta.env.VITE_API_BASE_URL ||
    "/api";
