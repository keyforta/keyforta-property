begin;

grant select, insert on app.jurisdiction_policy_versions to keyforta_runtime;
grant select, insert on app.policy_approval_evidence to keyforta_runtime;
grant select on app.policy_approval_revocations to keyforta_runtime;
grant select on app.jurisdiction_policy_activations to keyforta_runtime;

commit;
