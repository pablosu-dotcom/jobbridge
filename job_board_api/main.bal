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

}
