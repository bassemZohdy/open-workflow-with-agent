-- LiteLLM needs its own database for the virtual-key store and spend tracking. The
-- openworkflow_db database (POSTGRES_DB) is created by the postgres container itself.
CREATE DATABASE litellm_db;
