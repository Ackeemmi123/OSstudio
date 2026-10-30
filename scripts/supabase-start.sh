#!/usr/bin/env sh
# Starts the local Supabase stack with only the services Studio OS uses
# (database, auth, REST API, Storage for website images). Docker must be running.
exec npx supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta,mailpit "$@"
