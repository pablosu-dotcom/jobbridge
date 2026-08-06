
type Job record {|
    string id;
    string title;
    string organization;
    string location;
    string employmentType;
    string description;
    string applyUrl;
    decimal salaryMin?;
    decimal salaryMax?;
    string status;
|};

type CreateJobRequest record {|
    string title;
    string organization;
    string location;
    string employmentType;
    string description;
    string applyUrl;
    decimal salaryMin?;
    decimal salaryMax?;
|};

type JobRow record {|
    string id;
    string title;
    string organization;
    string location;
    string employment_type;
    string description;
    string apply_url;
    string salary_min?;
    string salary_max?;
    string status;
|};

type OrganizationRequest record {|
    string ownerUserId;
    string name;
    string website;
    string contactName;
    string contactEmail;
    string description;
|};

type Organization record {|
    string id;
    string ownerUserId;
    string name;
    string website?;
    string contactName;
    string contactEmail;
    string description?;
    string status;
|};
