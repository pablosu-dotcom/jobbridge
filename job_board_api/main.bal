import ballerina/http;
import ballerina/sql;
import ballerina/uuid;

listener http:Listener httpDefaultListener = http:getDefaultListener();

service /api on httpDefaultListener {
    resource function get jobs() returns Job[]|error {
        do {
            stream<JobRow, sql:Error?> jobRowStream = mysqlClient->query(`SELECT
    id,
    title,
    organization,
    location,
    employment_type,
    description,
    apply_url,
    salary_min,
    salary_max,
    status
 FROM jobs
 WHERE status = 'ACTIVE'
 ORDER BY created_at DESC`);
            JobRow[] jobRows = check from JobRow row in jobRowStream
                select row;
            Job[] jobs = from JobRow row in jobRows
                select {
                    id: row.id,
                    title: row.title,
                    organization: row.organization,
                    location: row.location,
                    employmentType: row.employment_type,
                    description: row.description,
                    applyUrl: row.apply_url,
                    status: row.status
                };
            return jobs;

        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

    resource function post jobs(@http:Payload CreateJobRequest payload) returns json|error {
        do {
            string jobId = uuid:createRandomUuid();
            Job newJob = {
                id: jobId,
                title: payload.title,
                organization: payload.organization,
                location: payload.location,
                employmentType: payload.employmentType,
                description: payload.description,
                applyUrl: payload.applyUrl,
                status: "PENDING",
                salaryMin: payload?.salaryMin,
                salaryMax: payload?.salaryMax
            };
            _ = check mysqlClient->execute(`INSERT INTO jobs (
    id,
    title,
    organization,
    location,
    employment_type,
    description,
    apply_url,
    salary_min,
    salary_max,
    status
)
VALUES (
    ${newJob.id},
    ${newJob.title},
    ${newJob.organization},
    ${newJob.location},
    ${newJob.employmentType},
    ${newJob.description},
    ${newJob.applyUrl},
    ${newJob.salaryMin},
    ${newJob.salaryMax},
    ${newJob.status}
)`);
            return newJob;
        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

    resource function get admin/jobs/pending() returns Job[]|error {
        do {
            stream<JobRow, sql:Error?> organizationRowStream = mysqlClient->query(`SELECT
id,
title,
organization,
location,
employment_type,
description,
apply_url,
salary_min,
salary_max,
status
FROM jobs
WHERE status = 'PENDING'
ORDER BY created_at DESC`);
            JobRow[] jobRows = check from JobRow row in organizationRowStream
                select row;
            Job[] jobs = from JobRow row in jobRows
                select {
                    id: row.id,
                    title: row.title,
                    organization: row.organization,
                    location: row.location,
                    employmentType: row.employment_type,
                    description: row.description,
                    applyUrl: row.apply_url,
                    status: row.status
                };
            return jobs;

        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

    resource function put admin/jobs/[string id]/approve() returns json|error {
        do {
            _ = check mysqlClient->execute(`UPDATE jobs
SET status = 'ACTIVE'
WHERE id = ${id}
AND status = 'PENDING'`);
        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

    resource function put admin/jobs/[string id]/reject() returns json|error {
        do {
            _ = check mysqlClient->execute(`UPDATE jobs
SET status = 'REJECTED'
WHERE id = ${id}
AND status = 'PENDING'`);
        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

    resource function post organizations(@http:Payload OrganizationRequest payload) returns json|error {
        do {
            string organizationId = uuid:createType1AsString();
            _ = check mysqlClient->execute(`INSERT INTO organizations (
id,
owner_user_id,
name,
website,
contact_name,
contact_email,
description,
status
)
Values (${organizationId}, ${payload.ownerUserId}, ${payload.name}, ${payload.website}, ${payload.contactName}, ${payload.contactEmail}, ${payload.description}, 'PENDING')`);
            return {
                id: organizationId,
                status: "PENDING",
                message: "Organization application submitted for review."
            };
        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

    resource function get organizations/me(@http:Query string ownerUserId) returns json|error|http:NotFound {
        do {
            Organization organization = check mysqlClient->queryRow(`SELECT
id,
owner_user_id AS ownerUserId,
name,
website,
contact_name as contactName,
contact_email as contactEmail,
description,
status
FROM organizations
WHERE owner_user_id = ${ownerUserId}
LIMIT 1`);
            return organization;
        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

    resource function get admin/organizations/pending() returns Organization[]|error {
        do {
            stream<Organization, sql:Error?> organizationStream = mysqlClient->query(`SELECT
id,
owner_user_id AS ownerUserId,
name,
website,
contact_name AS contactName,
contact_email AS contactEmail,
description,
status
FROM organizations
WHERE status = 'PENDING'
ORDER BY created_at DESC`);
            Organization[] pendingOrganizations = check from Organization organization in organizationStream
                select organization;

            return pendingOrganizations;

        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

    resource function put admin/organizations/[string id]/approve() returns json|error {
        do {
            _ = check mysqlClient->execute(`UPDATE organizations
SET
status = 'ACTIVE',
reviewed_at = CURRENT_TIMESTAMP
WHERE id = ${id}
AND status = 'PENDING'`);
        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

    resource function put admin/organizations/[string id]/reject() returns json|error {
        do {
            _ = check mysqlClient->execute(`UPDATE organizations
SET
status = 'REJECTED',
reviewed_at = CURRENT_TIMESTAMP
WHERE id = ${id}
AND status = 'PENDING'`);
        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

    resource function post ai/match\-jobs(@http:Payload AiMatchjobsPayload payload) returns json|http:Response|error {
        do {
            if payload.profile.trim().length() == 0 {
                return error("Candidate profile must not be empty");
            }

            Job[] jobs = check getActiveJobs();
            if jobs.length() == 0 {
                return {matches: []};
            }

            json jobsJson = jobs.toJson();
            string jobsText = jobsJson.toJsonString();
            string systemPrompt = string `You are the JobBridge job matching engine.

Your task is to match the candidate to the ACTIVE jobs provided below.

Available jobs:
${jobsText}

RULES:
1. Only recommend jobs contained in the AVAILABLE JOBS list.
2. Assign each job a match score from 0 to 100.
3. Only return jobs with a score of 60 or higher.
4. Return no more than 5 jobs.
5. Sort the matches from highest score to lowest score.
6. Give a short reason explaining why the job matches the candidate.
7. Do not invent jobs.
8. Return valid JSON only.

Return exactly this JSON structure:
{
  "matches": [
    {
      "jobId": "job-id",
      "score": 85,
      "reason": "Brief explanation of why this job matches"
    }
  ]
}`;

            http:Response gatewayResponse = check jobbridgeAiClient->/chat/completions.post(
    <json>{
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "system",
                "content": systemPrompt
            },
            {
                "role": "user",
                "content": payload.profile
            }
        ]
    },
    headers = {"X-API-Key": aiGatewayApiKey},
    mediaType = "application/json",
    targetType = http:Response
);

// Semantic Prompt Guard intervention
if gatewayResponse.statusCode == 422 {
    http:Response blockedResponse = new;
    blockedResponse.statusCode = 422;
    blockedResponse.setPayload({
        message: "This request is outside the scope of JobBridge. Please describe your skills, experience, location, or job preferences."
    });
    return blockedResponse;
}

// Handle other AI Gateway failures
if gatewayResponse.statusCode < 200 || gatewayResponse.statusCode >= 300 {
    string errorBody = check gatewayResponse.getTextPayload();
    return error(string `AI Gateway returned HTTP ${gatewayResponse.statusCode}: ${errorBody}`);
}

// Convert successful JSON response to your existing type
json aiJson = check gatewayResponse.getJsonPayload();
AiChatResponse aiResponse = check aiJson.cloneWithType();

string matchesText = aiResponse.choices[0].message.content;

            MatchJobsResponse result =
            check matchesText.fromJsonStringWithType();

            return result;
        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

}
