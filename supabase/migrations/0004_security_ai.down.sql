drop table if exists agent_runs cascade;
drop trigger if exists audit_logs_no_update on audit_logs;
drop function if exists audit_logs_immutable();
drop table if exists audit_logs cascade;
drop table if exists investigation_cases cascade;
drop table if exists risk_assessments cascade;
drop table if exists rate_limits cascade;
drop table if exists security_events cascade;
