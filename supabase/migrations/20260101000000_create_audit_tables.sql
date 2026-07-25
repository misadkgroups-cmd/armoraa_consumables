-- Create audit_logs table for tracking field-level changes
create table audit_logs (
    id bigserial primary key,
    table_name text not null,
    record_id bigint not null,
    action_type text not null,
    field_name text,
    old_value text,
    new_value text,
    performed_by bigint references users(id),
    performed_by_name text,
    performed_by_role text,
    branch_id bigint references branches(id),
    created_at timestamptz default now()
);

create index idx_audit_logs_record on audit_logs(table_name, record_id);
create index idx_audit_logs_created_at on audit_logs(created_at);
create index idx_audit_logs_branch on audit_logs(branch_id);

-- Create activity_logs table for tracking module activities
create table activity_logs (
    id bigserial primary key,
    module_name text not null,
    record_id bigint,
    activity_type text not null,
    activity_description text,
    user_id bigint references users(id),
    user_name text,
    user_role text,
    branch_id bigint references branches(id),
    created_at timestamptz default now()
);

create index idx_activity_logs_module on activity_logs(module_name, record_id);
create index idx_activity_logs_created_at on activity_logs(created_at);
create index idx_activity_logs_branch on activity_logs(branch_id);

-- Insert table comments
comment on table audit_logs is 'Tracks field-level changes for all audited tables';
comment on table activity_logs is 'Tracks module-level activities and events';