-- Studio OS: fix the search path of public.is_valid_actor().
--
-- Every other function sets `search_path = ''`, so a caller cannot make it
-- resolve a name to an object of their own. is_valid_actor() (core schema)
-- was the exception, flagged by Supabase's security advisor
-- (function_search_path_mutable). It only uses built-in JSON and text
-- functions, which are always found, so its results do not change.
-- tests/db/function-settings.test.ts keeps every public function this way.

alter function public.is_valid_actor(jsonb) set search_path = '';
