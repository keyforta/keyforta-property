begin;

alter table app.tenant_applications
  drop constraint tenant_applications_check,
  add constraint tenant_applications_status_submission_check check (
    (status = 'draft' and submitted_at is null)
    or (status in ('submitted', 'approved', 'declined') and submitted_at is not null)
  );

commit;