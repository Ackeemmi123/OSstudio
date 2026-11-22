/* ------------------------------------------------------------------------ */
/* Questions for the client on a review link. A studio member chooses up to */
/* eight questions for one build (often the AI draft's); the client answers */
/* them on the link without signing in. The answers become the client's     */
/* source material, so the next draft can use them with a source, like any  */
/* email. Anonymising a client already removes its sources and builds.      */
/* ------------------------------------------------------------------------ */

alter table public.site_builds
  add column client_questions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(client_questions) = 'array' and jsonb_array_length(client_questions) <= 8),
  add column questions_answered_at timestamptz;

/* A writer sets the questions on a link. An empty list takes them off. Answered questions stay as they were. */
create function public.set_build_questions(p_build uuid, p_questions jsonb) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid;
  v_answered timestamptz;
  v_question jsonb;
begin
  select studio_id, questions_answered_at into v_studio, v_answered from public.site_builds where id = p_build;
  if v_studio is null or not private.can_write(v_studio) then
    raise exception 'This build does not exist, or you cannot change it.' using errcode = '42501';
  end if;
  if v_answered is not null then
    raise exception 'The client has already answered these questions.' using errcode = '23505';
  end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) > 8 then
    raise exception 'Choose at most eight questions.' using errcode = '22023';
  end if;
  for v_question in select * from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(v_question) <> 'string' or char_length(btrim(v_question #>> '{}')) not between 1 and 300 then
      raise exception 'Each question is one line of at most 300 characters.' using errcode = '22023';
    end if;
  end loop;
  update public.site_builds set client_questions = p_questions where id = p_build;
end;
$$;

/* The client answers on the link. Service role only; once per build. The answers are stored as one source. */
create function public.record_review_answers(p_token text, p_answers jsonb) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_build public.site_builds;
  v_author text := btrim(coalesce(p_answers ->> 'author', ''));
  v_list jsonb := p_answers -> 'answers';
  v_text text := '';
  v_answer text;
  v_count int := 0;
  i int;
begin
  v_build := private.reviewable_build(p_token);
  if v_build.id is null then
    raise exception 'This link is not open for review.' using errcode = '42501';
  end if;
  if jsonb_array_length(v_build.client_questions) = 0 then
    raise exception 'There are no questions on this link.' using errcode = '42501';
  end if;
  if v_build.questions_answered_at is not null then
    raise exception 'The questions are already answered.' using errcode = '23505';
  end if;
  if char_length(v_author) not between 1 and 120 or jsonb_typeof(v_list) <> 'array'
     or jsonb_array_length(v_list) <> jsonb_array_length(v_build.client_questions) then
    raise exception 'The answers do not match the questions.' using errcode = '22023';
  end if;
  for i in 0 .. jsonb_array_length(v_list) - 1 loop
    v_answer := btrim(coalesce(v_list ->> i, ''));
    if char_length(v_answer) > 3000 then
      raise exception 'An answer is too long.' using errcode = '22023';
    end if;
    if v_answer <> '' then
      v_count := v_count + 1;
      v_text := v_text || format(E'Fråga: %s\nSvar: %s\n\n', v_build.client_questions ->> i, v_answer);
    end if;
  end loop;
  if v_count = 0 then
    raise exception 'Answer at least one question.' using errcode = '22023';
  end if;
  insert into public.client_sources (id, studio_id, client_id, type, label, content, added_by)
  values (gen_random_uuid(), v_build.studio_id, v_build.client_id, 'other',
    left(format('Svar på frågor via granskningslänken (version %s): %s', v_build.spec_version, v_author), 160),
    btrim(v_text, E' \n'), jsonb_build_object('kind', 'human', 'name', left(v_author || ' (kunden, via granskningslänken)', 160)));
  update public.site_builds set questions_answered_at = now() where id = v_build.id;
  insert into public.activity_events (id, studio_id, entity_type, entity_id, event_type, description, actor)
  values (gen_random_uuid(), v_build.studio_id, 'client', v_build.client_id, 'site_spec.client_answered',
    left(format('The client answered %s questions on the review link (version %s): %s', v_count, v_build.spec_version, v_author), 500),
    '{"kind":"system"}'::jsonb);
end;
$$;

/* What the review bar shows now also carries the questions, until they are answered. */
create or replace function public.site_review_state(p_token text) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare
  v_build public.site_builds;
begin
  v_build := private.reviewable_build(p_token);
  if v_build.id is null then return null; end if;
  return jsonb_build_object(
    'buildId', v_build.id,
    'studioId', v_build.studio_id,
    'comments', coalesce((select jsonb_agg(jsonb_build_object('page', c.page_path, 'target', c.target, 'body', c.body,
        'author', c.author_name, 'status', c.status, 'reply', c.reply, 'at', c.created_at) order by c.created_at)
      from public.site_review_comments c where c.build_id = v_build.id), '[]'::jsonb),
    'approval', (select jsonb_build_object('name', a.approver_name, 'role', a.approver_role, 'at', a.created_at)
      from public.site_approvals a where a.build_id = v_build.id),
    'questions', case when v_build.questions_answered_at is null then v_build.client_questions else '[]'::jsonb end,
    'answered', v_build.questions_answered_at is not null);
end;
$$;

revoke all on function public.set_build_questions(uuid, jsonb), public.record_review_answers(text, jsonb) from public, anon, authenticated;
grant execute on function public.set_build_questions(uuid, jsonb) to authenticated;
grant execute on function public.record_review_answers(text, jsonb) to service_role;
