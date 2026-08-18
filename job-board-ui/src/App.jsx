import { useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@asgardeo/auth-react";
import "./App.css";
import { API_BASE_URL } from "./config";
import { matchJobs } from "./services/jobService";

const emptyForm = {
  title: "",
  organization: "",
  location: "",
  employmentType: "full-time",
  description: "",
  applyUrl: "",
};

const emptyOrganizationForm = {
  name: "",
  website: "",
  contactName: "",
  contactEmail: "",
  description: "",
};

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replaceAll(" ", "_");
}

function extractRoles(token) {
  if (!token) {
    return [];
  }

  const possibleRoles = [
    token.roles,
    token.groups,
    token.role,
    token["http://wso2.org/claims/role"],
  ];

  return possibleRoles
    .flatMap((value) => {
      if (!value) {
        return [];
      }

      if (Array.isArray(value)) {
        return value;
      }

      return String(value)
        .split(",")
        .map((item) => item.trim());
    })
    .map(normalizeRole)
    .filter(Boolean);
}

export default function App() {
  const {
    state,
    signIn,
    signOut,
    getDecodedIDToken,
    getAccessToken,
  } = useAuthContext();

  const [jobs, setJobs] = useState([]);
  const [pendingJobs, setPendingJobs] = useState([]);
  const [pendingOrganizations, setPendingOrganizations] = useState([]);
  const [roles, setRoles] = useState([]);

  const [currentUserId, setCurrentUserId] = useState("");
  const [organization, setOrganization] = useState(null);
  const [organizationForm, setOrganizationForm] = useState(emptyOrganizationForm);

  const [search, setSearch] = useState("");
  const [matcherProfile, setMatcherProfile] = useState("");
  const [jobMatches, setJobMatches] = useState([]);
  const [hasMatchedJobs, setHasMatchedJobs] = useState(false);
  const [activeView, setActiveView] = useState("jobs");
  const [form, setForm] = useState(emptyForm);

  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingPendingJobs, setLoadingPendingJobs] = useState(false);
  const [loadingPendingOrganizations, setLoadingPendingOrganizations] = useState(false);
  const [loadingOrganization, setLoadingOrganization] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittingOrganization, setSubmittingOrganization] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [matcherError, setMatcherError] = useState("");

  const isAuthenticated = state.isAuthenticated;
  const isAdmin = roles.includes("ADMIN");
  const isMemberOrganization =
    roles.includes("MEMBER_ORGANIZATION");
  const isJobSeeker = roles.includes("JOB_SEEKER");
  const organizationStatus = String(
  organization?.status || ""
).toUpperCase();

const hasPendingOrganization =
  organizationStatus === "PENDING";

const hasApprovedOrganization =
  organizationStatus === "ACTIVE" ||
  organizationStatus === "APPROVED";

const hasRejectedOrganization =
  organizationStatus === "REJECTED";

const canRegisterOrganization =
  isAuthenticated &&
  !isAdmin &&
  !isMemberOrganization;


  useEffect(() => {
    loadJobs();
  }, []);

  useEffect(() => {
    async function loadUserRoles() {
      if (!isAuthenticated) {
        setRoles([]);
        setCurrentUserId("");
        setOrganization(null);
        setActiveView("jobs");
        return;
      }

      try {
        setLoadingRoles(true);

        const decodedToken = await getDecodedIDToken();
        const tokenRoles = extractRoles(decodedToken);
        const userId = String(decodedToken?.sub || "");

        console.log("Decoded ID token:", decodedToken);
        console.log("User roles:", tokenRoles);
        console.log("User ID:", userId);

        setRoles(tokenRoles);
        setCurrentUserId(userId);


      } catch (err) {
        console.error("Unable to read user roles:", err);
        setRoles([]);
        setCurrentUserId("");
      } finally {
        setLoadingRoles(false);
      }
    }

    loadUserRoles();
  }, [isAuthenticated, getDecodedIDToken]);

  useEffect(() => {
  if (!isAuthenticated || !currentUserId || loadingRoles) {
    setOrganization(null);
    return;
  }

  // Administrators and approved member organizations
  // do not need an organization application lookup.
  if (isAdmin || isMemberOrganization) {
    setOrganization(null);
    return;
  }

  loadMyOrganization(currentUserId);
}, [
  isAuthenticated,
  currentUserId,
  loadingRoles,
  isAdmin,
  isMemberOrganization,
]);

  async function loadJobs() {
    try {
      setLoadingJobs(true);
      setError("");

      const response = await fetch(`${API_BASE_URL}/jobs`);

      if (!response.ok) {
        throw new Error(`Unable to load jobs (${response.status})`);
      }

      const data = await response.json();

      setJobs(Array.isArray(data) ? data : data.jobs || []);
    } catch (err) {
      console.error(err);
      setError("Unable to load jobs.");
    } finally {
      setLoadingJobs(false);
    }
  }

  async function loadMyOrganization(ownerUserId) {
  if (!ownerUserId) {
    setOrganization(null);
    return;
  }

  try {
    setLoadingOrganization(true);
    setError("");

    const accessToken = await getAccessToken();

    const response = await fetch(
      `${API_BASE_URL}/organizations/me?ownerUserId=${encodeURIComponent(
        ownerUserId
      )}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.status === 404) {
      setOrganization(null);
      return;
    }

    if (!response.ok) {
      const responseText = await response.text();

      throw new Error(
        responseText ||
          `Unable to load organization application (${response.status})`
      );
    }

    const data = await response.json();
    setOrganization(data);
  } catch (err) {
    console.error("Unable to load organization:", err);

    setError(
      err.message || "Unable to load organization application."
    );
  } finally {
    setLoadingOrganization(false);
  }
}

async function loadPendingOrganizations() {
  if (!isAuthenticated || !isAdmin) {
    setPendingOrganizations([]);
    return;
  }

  try {
    setLoadingPendingOrganizations(true);
    setError("");

    const accessToken = await getAccessToken();

    const response = await fetch(
      `${API_BASE_URL}/admin/organizations/pending`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const responseText = await response.text();

      throw new Error(
        responseText ||
          `Unable to load pending organizations (${response.status})`
      );
    }

    const data = await response.json();

    setPendingOrganizations(
      Array.isArray(data) ? data : []
    );
  } catch (err) {
    console.error(
      "Unable to load pending organizations:",
      err
    );

    setError(
      err.message ||
        "Unable to load pending organization applications."
    );
  } finally {
    setLoadingPendingOrganizations(false);
  }
}

  async function loadPendingJobs() {
  try {
    setLoadingPendingJobs(true);
    setError("");

    const accessToken = await getAccessToken();

    const response = await fetch(`${API_BASE_URL}/admin/jobs/pending`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Unable to load pending jobs (${response.status})`
      );
    }

    const data = await response.json();

    setPendingJobs(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("Unable to load pending jobs:", err);
    setError(err.message || "Unable to load pending jobs.");
  } finally {
    setLoadingPendingJobs(false);
  }
}

async function approveJob(jobId) {
  try {
    setMessage("");
    setError("");

    const accessToken = await getAccessToken();

    const response = await fetch(
      `${API_BASE_URL}/admin/jobs/${jobId}/approve`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const responseText = await response.text();

      throw new Error(
        responseText ||
          `Unable to approve job (${response.status})`
      );
    }

    setMessage("Job approved successfully.");

    await loadPendingJobs();
    await loadJobs();
  } catch (err) {
    console.error("Unable to approve job:", err);
    setError(err.message || "Unable to approve job.");
  }
}

async function rejectJob(jobId) {
  try {
    setMessage("");
    setError("");

    const accessToken = await getAccessToken();

    const response = await fetch(
      `${API_BASE_URL}/admin/jobs/${jobId}/reject`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const responseText = await response.text();

      throw new Error(
        responseText ||
          `Unable to reject job (${response.status})`
      );
    }

    setMessage("Job rejected successfully.");

    await loadPendingJobs();
  } catch (err) {
    console.error("Unable to reject job:", err);
    setError(err.message || "Unable to reject job.");
  }
}

async function reviewOrganization(
  organizationId,
  decision
) {
  try {
    setMessage("");
    setError("");

    const accessToken = await getAccessToken();

    const response = await fetch(
      `${API_BASE_URL}/admin/organizations/${organizationId}/${decision}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const responseText = await response.text();

      throw new Error(
        responseText ||
          `Unable to ${decision} organization (${response.status})`
      );
    }

    setPendingOrganizations((currentOrganizations) =>
      currentOrganizations.filter(
        (organization) =>
          organization.id !== organizationId
      )
    );

    setMessage(
      decision === "approve"
        ? "Organization approved successfully."
        : "Organization rejected successfully."
    );
  } catch (err) {
    console.error(
      `Unable to ${decision} organization:`,
      err
    );

    setError(
      err.message ||
        `Unable to ${decision} organization.`
    );
  }
}

async function approveOrganization(organizationId) {
  await reviewOrganization(
    organizationId,
    "approve"
  );
}

async function rejectOrganization(organizationId) {
  await reviewOrganization(
    organizationId,
    "reject"
  );
}
  const filteredJobs = useMemo(() => {
    const searchText = search.toLowerCase().trim();

    return jobs.filter((job) => {
      const isActive =
        !job.status ||
        String(job.status).toUpperCase() === "ACTIVE";

      if (!isActive) {
        return false;
      }

      if (!searchText) {
        return true;
      }

      return (
        (job.title || "").toLowerCase().includes(searchText) ||
        (job.organization || "")
          .toLowerCase()
          .includes(searchText) ||
        (job.location || "")
          .toLowerCase()
          .includes(searchText) ||
        (job.employmentType || "")
          .toLowerCase()
          .includes(searchText) ||
        (job.description || "")
          .toLowerCase()
          .includes(searchText)
      );
    });
  }, [jobs, search]);

  const matchedJobs = useMemo(() => {
    const jobsById = new Map(
      jobs.map((job) => [String(job.id), job])
    );

    return jobMatches
      .map((match) => {
        const job = jobsById.get(String(match.jobId));

        return job ? { ...job, match } : null;
      })
      .filter(Boolean)
      .sort(
        (first, second) =>
          Number(second.match.score) - Number(first.match.score)
      );
  }, [jobMatches, jobs]);

  async function handleJobMatch(event) {
    event.preventDefault();

    const profile = matcherProfile.trim();

    if (!profile) {
      setMatcherError("Please describe what you are looking for.");
      setHasMatchedJobs(false);
      setJobMatches([]);
      return;
    }

    try {
      setLoadingMatches(true);
      setMatcherError("");
      setHasMatchedJobs(false);

      const matches = await matchJobs(profile);

      setJobMatches(matches);
      setHasMatchedJobs(true);
    } catch (err) {
      console.error("Unable to find matching jobs:", err);
      setJobMatches([]);
      setMatcherError(
        err.message || "Unable to find matching jobs. Please try again."
      );
    } finally {
      setLoadingMatches(false);
    }
  }

  function openApplication(job) {
    if (!job.applyUrl) {
      alert("Application URL not configured.");
      return;
    }

    const url = /^https?:\/\//i.test(job.applyUrl)
      ? job.applyUrl
      : `https://${job.applyUrl}`;

    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  function handleOrganizationFormChange(event) {
  const { name, value } = event.target;

  setOrganizationForm((currentForm) => ({
    ...currentForm,
    [name]: value,
  }));
}

async function submitOrganization(event) {
  event.preventDefault();

  if (!isAuthenticated || !currentUserId) {
    setError("You must sign in before registering an organization.");
    return;
  }

  try {
    setSubmittingOrganization(true);
    setMessage("");
    setError("");

    const accessToken = await getAccessToken();

    const response = await fetch(`${API_BASE_URL}/organizations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        ownerUserId: currentUserId,
        name: organizationForm.name.trim(),
        website: organizationForm.website.trim(),
        contactName: organizationForm.contactName.trim(),
        contactEmail: organizationForm.contactEmail.trim(),
        description: organizationForm.description.trim(),
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();

      throw new Error(
        responseText ||
          `Unable to submit organization (${response.status})`
      );
    }

    setOrganizationForm(emptyOrganizationForm);

    await loadMyOrganization(currentUserId);

    setMessage(
      "Organization application submitted for administrator review."
    );
  } catch (err) {
    console.error("Unable to register organization:", err);

    setError(
      err.message || "Unable to submit organization application."
    );
  } finally {
    setSubmittingOrganization(false);
  }
}
  async function handleSubmit(event) {
    event.preventDefault();

    if (!isAuthenticated) {
      setError("You must sign in before posting a job.");
      return;
    }

    if (!isMemberOrganization && !isAdmin) {
      setError(
        "Only member organizations may submit job postings."
      );
      return;
    }

    try {
      setSubmitting(true);
      setMessage("");
      setError("");

      const accessToken = await getAccessToken();

      const response = await fetch(`${API_BASE_URL}/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: form.title.trim(),
          organization: form.organization.trim(),
          location: form.location.trim(),
          employmentType: form.employmentType,
          description: form.description.trim(),
          applyUrl: form.applyUrl.trim(),
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();

        throw new Error(
          responseText ||
            `Unable to submit job (${response.status})`
        );
      }

      setForm(emptyForm);
      setMessage(
        "Job submitted successfully and is awaiting administrator approval."
      );
      setActiveView("jobs");

      await loadJobs();
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to submit the job.");
    } finally {
      setSubmitting(false);
    }
  }


  async function changeView(view) {
  if (view === "create") {
    if (!isAuthenticated) {
      await signIn();
      return;
    }

    if (!isMemberOrganization && !isAdmin) {
      setError(
        "Your account does not have permission to post jobs."
      );
      return;
    }
  }

if (view === "admin") {
  if (!isAuthenticated) {
    await signIn();
    return;
  }

  if (!isAdmin) {
    setError("Administrator access is required.");
    return;
  }

  await Promise.all([
    loadPendingOrganizations(),
    loadPendingJobs(),
  ]);
}

  if (view === "organization") {
  if (!isAuthenticated) {
    await signIn();
    return;
  }

  if (isAdmin || isMemberOrganization) {
    setError(
      "Your account does not need an organization application."
    );
    return;
  }

  await loadMyOrganization(currentUserId);
}
  setActiveView(view);
  setMessage("");
  setError("");
}

  return (
    <div className="app">
      <header className="header">
        <img
          src="/jobbridge-logo.png"
          alt="JobBridge"
          className="logo"
        />

        <div className="authControls">
          {isAuthenticated ? (
            <>
              <div className="userSummary">
                <span className="signedInUser">
                  {state.username || "Signed in"}
                </span>

                {!loadingRoles && roles.length > 0 && (
                  <span className="roleText">
                    {roles.join(", ")}
                  </span>
                )}
              </div>

              <button
                type="button"
                className="signOutButton"
                onClick={() => signOut()}
              >
                Sign Out
              </button>
            </>
          ) : (
            <button
              type="button"
              className="signInButton"
              onClick={() => signIn()}
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      <main className="container">
        <div className="viewTabs">
          <button
            type="button"
            className={
              activeView === "jobs"
                ? "tab activeTab"
                : "tab"
            }
            onClick={() => changeView("jobs")}
          >
            Find Jobs
          </button>

          {canRegisterOrganization && (
  <button
    type="button"
    className={
      activeView === "organization"
        ? "tab activeTab"
        : "tab"
    }
    onClick={() => changeView("organization")}
  >
    Register Organization
  </button>
)}

          {(isMemberOrganization || isAdmin) && (
            <button
              type="button"
              className={
                activeView === "create"
                  ? "tab activeTab"
                  : "tab"
              }
              onClick={() => changeView("create")}
            >
              Post a Job
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              className={
                activeView === "admin"
                  ? "tab activeTab"
                  : "tab"
              }
              onClick={() => changeView("admin")}
            >
              Admin Review
            </button>
          )}
        </div>

        {message && (
          <div className="successMessage">{message}</div>
        )}

        {error && (
          <div className="errorMessage">{error}</div>
        )}

        {activeView === "jobs" && (
          <>
            <h1>
              Connecting Local Talent with Community
              Opportunities
            </h1>

            <div className="searchBar">
              <input
                type="search"
                placeholder="Search jobs..."
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
              />
            </div>

            <section className="jobMatcher" aria-labelledby="job-matcher-heading">
              <h2 id="job-matcher-heading">AI Job Matcher</h2>
              <p className="matcherIntroduction">
                Tell us about your skills, experience, preferred location,
                and the type of work you want.
              </p>

              <form onSubmit={handleJobMatch}>
                <label htmlFor="matcher-profile">Your job preferences</label>
                <textarea
                  id="matcher-profile"
                  rows="5"
                  value={matcherProfile}
                  onChange={(event) => setMatcherProfile(event.target.value)}
                  placeholder="For example: I have five years of customer service experience and want part-time work in Coral Gables."
                />
                <button
                  type="submit"
                  className="matchButton"
                  disabled={loadingMatches || loadingJobs}
                >
                  {loadingMatches ? "Finding Matches..." : "Find Matching Jobs"}
                </button>
              </form>

              {matcherError && (
                <div className="matcherError" role="alert">
                  {matcherError}
                </div>
              )}

              {loadingMatches && (
                <div className="matcherState">Finding your best matches...</div>
              )}

              {!loadingMatches && hasMatchedJobs && matchedJobs.length === 0 && (
                <div className="matcherState">
                  No matching jobs were found among the currently available jobs.
                </div>
              )}

              {!loadingMatches && matchedJobs.length > 0 && (
                <div className="matchResults">
                  <h3>Recommended Jobs</h3>
                  {matchedJobs.map((job) => (
                    <article key={job.id} className="jobCard matchCard">
                      <div className="jobInfo">
                        <div className="matchHeading">
                          <h3>{job.title}</h3>
                          <span className="matchScore">
                            {job.match.score}% match
                          </span>
                        </div>
                        <p className="organization">{job.organization}</p>
                        <p className="details">{job.location}</p>
                        <p className="matchReason">{job.match.reason}</p>
                      </div>
                      <div className="jobActions">
                        <button
                          type="button"
                          className="applyButton"
                          onClick={() => openApplication(job)}
                        >
                          Apply
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <h2>Available Jobs</h2>

            {loadingJobs && (
              <div className="emptyState">
                Loading jobs...
              </div>
            )}

            {!loadingJobs &&
              filteredJobs.length === 0 && (
                <div className="emptyState">
                  No jobs found.
                </div>
              )}

            {!loadingJobs &&
              filteredJobs.map((job) => (
                <article
                  key={job.id}
                  className="jobCard"
                >
                  <div className="jobInfo">
                    <h3>{job.title}</h3>

                    <p className="organization">
                      {job.organization}
                    </p>

                    <p className="details">
                      {job.location} •{" "}
                      {job.employmentType}
                    </p>

                    <p className="description">
                      {job.description}
                    </p>
                  </div>

                  <div className="jobActions">
                    <button
                      type="button"
                      className="applyButton"
                      onClick={() =>
                        openApplication(job)
                      }
                    >
                      Apply
                    </button>
                  </div>
                </article>
              ))}
          </>
        )}

        {activeView === "organization" &&
  canRegisterOrganization && (
    <section className="createSection">
      <h1>Register Your Organization</h1>

      {loadingOrganization && (
        <div className="emptyState">
          Loading organization application...
        </div>
      )}

      {!loadingOrganization &&
        !organization && (
          <>
            <p className="formIntroduction">
              Submit your organization for administrator
              review.
            </p>

            <form
              className="jobForm"
              onSubmit={submitOrganization}
            >
              <label>
                Organization name
                <input
                  type="text"
                  name="name"
                  value={organizationForm.name}
                  onChange={handleOrganizationFormChange}
                  required
                />
              </label>

              <label>
                Website
                <input
                  type="url"
                  name="website"
                  value={organizationForm.website}
                  onChange={handleOrganizationFormChange}
                  placeholder="https://example.org"
                />
              </label>

              <label>
                Contact name
                <input
                  type="text"
                  name="contactName"
                  value={organizationForm.contactName}
                  onChange={handleOrganizationFormChange}
                  required
                />
              </label>

              <label>
                Contact email
                <input
                  type="email"
                  name="contactEmail"
                  value={organizationForm.contactEmail}
                  onChange={handleOrganizationFormChange}
                  required
                />
              </label>

              <label>
                Organization description
                <textarea
                  name="description"
                  value={organizationForm.description}
                  onChange={handleOrganizationFormChange}
                  rows="5"
                  required
                />
              </label>

              <button
                type="submit"
                className="publishButton"
                disabled={submittingOrganization}
              >
                {submittingOrganization
                  ? "Submitting..."
                  : "Submit for Review"}
              </button>
            </form>
          </>
        )}

      {!loadingOrganization &&
        hasPendingOrganization && (
          <div className="organizationStatusCard pendingOrganization">
            <h2>Application Pending</h2>

            <p>
              <strong>{organization.name}</strong> is awaiting
              administrator review.
            </p>

            <p>
              You will be able to post jobs after the
              organization is approved and your member role
              is assigned.
            </p>
          </div>
        )}

      {!loadingOrganization &&
        hasRejectedOrganization && (
          <div className="organizationStatusCard rejectedOrganization">
            <h2>Application Rejected</h2>

            <p>
              The application for{" "}
              <strong>{organization.name}</strong> was not
              approved.
            </p>

            <p>
              Contact the JobBridge administrator for more
              information.
            </p>
          </div>
        )}

      {!loadingOrganization &&
        hasApprovedOrganization &&
        !isMemberOrganization && (
          <div className="organizationStatusCard approvedOrganization">
            <h2>Organization Approved</h2>

            <p>
              <strong>{organization.name}</strong> has been
              approved.
            </p>

            <p>
              Your member role must now be assigned in
              Asgardeo. Sign out and sign in again after the
              role is assigned.
            </p>
          </div>
        )}
    </section>
  )}

        {activeView === "create" &&
          (isMemberOrganization || isAdmin) && (
            <section className="createSection">
              <h1>Post a Job</h1>

              <p className="formIntroduction">
                Submit a new opportunity for administrator
                review.
              </p>

              <form
                className="jobForm"
                onSubmit={handleSubmit}
              >
                <label>
                  Job title
                  <input
                    type="text"
                    name="title"
                    value={form.title}
                    onChange={handleFormChange}
                    required
                  />
                </label>

                <label>
                  Organization
                  <input
                    type="text"
                    name="organization"
                    value={form.organization}
                    onChange={handleFormChange}
                    required
                  />
                </label>

                <label>
                  Location
                  <input
                    type="text"
                    name="location"
                    value={form.location}
                    onChange={handleFormChange}
                    required
                  />
                </label>

                <label>
                  Employment type
                  <select
                    name="employmentType"
                    value={form.employmentType}
                    onChange={handleFormChange}
                    required
                  >
                    <option value="full-time">
                      Full-time
                    </option>
                    <option value="part-time">
                      Part-time
                    </option>
                    <option value="contract">
                      Contract
                    </option>
                    <option value="temporary">
                      Temporary
                    </option>
                    <option value="internship">
                      Internship
                    </option>
                  </select>
                </label>

                <label>
                  Description
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handleFormChange}
                    rows="5"
                    required
                  />
                </label>

                <label>
                  Application URL
                  <input
                    type="text"
                    name="applyUrl"
                    value={form.applyUrl}
                    onChange={handleFormChange}
                    placeholder="https://example.org/apply"
                    required
                  />
                </label>

                <button
                  type="submit"
                  className="publishButton"
                  disabled={submitting}
                >
                  {submitting
                    ? "Submitting..."
                    : "Submit for Review"}
                </button>
              </form>
            </section>
          )}

        {activeView === "admin" && isAdmin && (
  <section className="adminSection">
    <h1>Administrator Review</h1>

<div className="adminReviewGroup">
  <div className="sectionHeadingRow">
    <div>
      <h2>Pending Organizations</h2>
      <p>
        Review organizations requesting permission to
        publish jobs.
      </p>
    </div>

    <button
      type="button"
      className="secondaryButton"
      onClick={loadPendingOrganizations}
      disabled={loadingPendingOrganizations}
    >
      {loadingPendingOrganizations
        ? "Refreshing..."
        : "Refresh"}
    </button>
  </div>

  {loadingPendingOrganizations && (
    <div className="emptyState">
      Loading pending organizations...
    </div>
  )}

  {!loadingPendingOrganizations &&
    pendingOrganizations.length === 0 && (
      <div className="emptyState">
        No organization applications are awaiting review.
      </div>
    )}

  {!loadingPendingOrganizations &&
    pendingOrganizations.length > 0 && (
      <div className="adminCards">
        {pendingOrganizations.map((organization) => (
          <article
            className="adminReviewCard"
            key={organization.id}
          >
            <div className="adminReviewContent">
              <div className="reviewCardHeader">
                <div>
                  <h3>{organization.name}</h3>
                  <span className="statusBadge pendingBadge">
                    Pending
                  </span>
                </div>
              </div>

              <dl className="organizationDetails">
                <div>
                  <dt>Contact</dt>
                  <dd>{organization.contactName}</dd>
                </div>

                <div>
                  <dt>Email</dt>
                  <dd>
                    <a
                      href={`mailto:${organization.contactEmail}`}
                    >
                      {organization.contactEmail}
                    </a>
                  </dd>
                </div>

                {organization.website && (
                  <div>
                    <dt>Website</dt>
                    <dd>
                      <a
                        href={organization.website}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {organization.website}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>

              {organization.description && (
                <p className="reviewDescription">
                  {organization.description}
                </p>
              )}
            </div>

            <div className="reviewActions">
              <button
                type="button"
                className="approveButton"
                onClick={() =>
                  approveOrganization(
                    organization.id
                  )
                }
              >
                Approve
              </button>

              <button
                type="button"
                className="rejectButton"
                onClick={() =>
                  rejectOrganization(
                    organization.id
                  )
                }
              >
                Reject
              </button>
            </div>
          </article>
        ))}
      </div>
    )}
</div>

    <p className="formIntroduction">
      Review pending job postings and approve or reject them.
    </p>

    {loadingPendingJobs && (
      <div className="emptyState">
        Loading pending jobs...
      </div>
    )}

    {!loadingPendingJobs && pendingJobs.length === 0 && (
      <div className="emptyState">
        No pending jobs.
      </div>
    )}

    {!loadingPendingJobs &&
      pendingJobs.map((job) => (
        <article
          key={job.id}
          className="jobCard adminJobCard"
        >
          <div className="jobInfo">
            <h3>{job.title}</h3>

            <p className="organization">
              {job.organization}
            </p>

            <p className="details">
              {job.location} • {job.employmentType}
            </p>

            <p className="description">
              {job.description}
            </p>

            <p className="pendingStatus">
              Status: {job.status}
            </p>
          </div>

          <div className="adminActions">
            <button
              type="button"
              className="approveButton"
              onClick={() => approveJob(job.id)}
            >
              Approve
            </button>

            <button
              type="button"
              className="rejectButton"
              onClick={() => rejectJob(job.id)}
            >
              Reject
            </button>
          </div>
        </article>
      ))}
  </section>
)}
      </main>

      <footer>
        © {new Date().getFullYear()} JobBridge
      </footer>
    </div>
  );
}
