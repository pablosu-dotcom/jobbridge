const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "/api";

export async function getJobs() {
  const response = await fetch(`${API_BASE_URL}/jobs`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let message = `Unable to load jobs. HTTP ${response.status}`;

    try {
      const errorBody = await response.json();

      if (errorBody.message) {
        message = errorBody.message;
      }
    } catch {
      // The response did not contain JSON.
    }

    throw new Error(message);
  }

  const jobs = await response.json();

  if (!Array.isArray(jobs)) {
    throw new Error("The jobs API returned an unexpected response.");
  }

  return jobs;
}