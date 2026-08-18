import { API_BASE_URL } from "../config";

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

export async function matchJobs(profile) {
  const response = await fetch(`${API_BASE_URL}/ai/match-jobs`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ profile }),
  });

  if (!response.ok) {
    let message = `Unable to find matching jobs. HTTP ${response.status}`;

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

  const data = await response.json();

  if (!Array.isArray(data.matches)) {
    throw new Error("The job matching API returned an unexpected response.");
  }

  return data.matches;
}
