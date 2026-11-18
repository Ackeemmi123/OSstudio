/* ------------------------------------------------------------------------ */
/* The agency's own brand: what clients see instead of Studio OS. Shown on  */
/* built prototype sites, on preview link pages, and later on the client   */
/* review page and in mail to clients.                                      */
/*                                                                          */
/* Stored on the studio as one object; owners change it through            */
/* update_studio_brand, which checks every value. The logo lives in a      */
/* public bucket, since it is shown on pages anyone with a link can open.  */
/* ------------------------------------------------------------------------ */

alter table public.studios add column brand jsonb not null default '{}'::jsonb
  check (jsonb_typeof(brand) = 'object');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('studio-brand', 'studio-brand', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

/* An owner sets the brand. Empty values are left out; every other value is checked. */
create function public.update_studio_brand(p_studio uuid, p_brand jsonb) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  v_brand jsonb := '{}'::jsonb;
  v_key text;
  v_value text;
begin
  if not private.is_owner(p_studio) then
    raise exception 'Only an owner can change the agency brand.' using errcode = '42501';
  end if;
  if p_brand is null or jsonb_typeof(p_brand) <> 'object' then
    raise exception 'The brand was not understood.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_brand) loop
    if v_key not in ('name', 'website', 'email', 'color', 'logoPath') then
      raise exception 'Unknown brand field: %', v_key using errcode = '22023';
    end if;
    v_value := btrim(coalesce(p_brand ->> v_key, ''));
    continue when v_value = '';
    if (v_key = 'name' and char_length(v_value) > 80)
      or (v_key = 'website' and (char_length(v_value) > 200 or v_value !~ '^https://[^\s/]+\.[^\s]+$'))
      or (v_key = 'email' and (char_length(v_value) > 200 or v_value !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'))
      or (v_key = 'color' and v_value !~ '^#[0-9A-Fa-f]{6}$')
      or (v_key = 'logoPath' and v_value !~ ('^' || p_studio::text || '/logo-[0-9a-f-]{36}\.(png|jpg|webp)$')) then
      raise exception 'The brand field % is not valid.', v_key using errcode = '22023';
    end if;
    v_brand := v_brand || jsonb_build_object(v_key, v_value);
  end loop;
  update public.studios set brand = v_brand where id = p_studio;
  return v_brand;
end;
$$;

/* The brand behind a preview link, for its pages. Server only. */
create function public.studio_brand(p_studio uuid) returns jsonb
  language sql security definer stable set search_path = '' as $$
  select jsonb_build_object('studioName', name) || brand from public.studios where id = p_studio;
$$;

revoke all on function public.update_studio_brand(uuid, jsonb), public.studio_brand(uuid) from public, anon, authenticated;
grant execute on function public.update_studio_brand(uuid, jsonb) to authenticated;
grant execute on function public.studio_brand(uuid) to service_role;
