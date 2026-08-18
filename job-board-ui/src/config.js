const PRODUCTION_API_BASE_URL =
  "https://35.231.59.214/jobbridge/1.0";

export const API_BASE_URL = import.meta.env.DEV
  ? import.meta.env.VITE_API_BASE_URL || "/api"
  : window?.configs?.apiUrl ||
    import.meta.env.VITE_API_BASE_URL ||
    PRODUCTION_API_BASE_URL;

export const AI_API_BASE_URL = import.meta.env.DEV
  ? API_BASE_URL
  : window?.configs?.aiApiUrl ||
    "/choreo-apis/pablosu-jobbridge/jobboardapi/v1";
