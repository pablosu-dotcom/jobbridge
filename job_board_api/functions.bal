import ballerina/sql;

# getActiveJobs description
# + return - Active jobbridge jobs
public function getActiveJobs() returns Job[]|error {
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

}
