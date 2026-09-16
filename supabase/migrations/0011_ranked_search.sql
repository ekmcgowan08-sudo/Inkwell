-- Full-text-search-ranked retrieval for the AI assistant's context builder.
--
-- scenes.search_vector and story_bible_entries.search_vector (0004, 0005) already exist as
-- generated tsvector columns with GIN indexes; the context builder previously only sampled by
-- recency. These functions rank matches against the author's actual question with ts_rank.
--
-- LANGUAGE sql, no `security definer`: these run SECURITY INVOKER (the default), so row level
-- security on scenes/story_bible_entries applies exactly as it would to a plain select from the
-- calling user's own session — see docs/AI_ARCHITECTURE.md and tests/rls/run.ts.

create or replace function public.search_scenes_ranked(p_project_id uuid, p_query text, p_limit int default 12)
returns table (id uuid, chapter_id uuid, title text, plain_text text, updated_at timestamptz, rank real)
language sql
stable
as $$
  select s.id, s.chapter_id, s.title, s.plain_text, s.updated_at,
         ts_rank(s.search_vector, plainto_tsquery('english', p_query)) as rank
  from public.scenes s
  where s.project_id = p_project_id
    and s.deleted_at is null
    and s.plain_text <> ''
    and s.search_vector @@ plainto_tsquery('english', p_query)
  order by rank desc, s.updated_at desc
  limit p_limit;
$$;

create or replace function public.search_story_bible_entries_ranked(p_project_id uuid, p_query text, p_limit int default 40)
returns table (id uuid, name text, entry_type text, summary text, fields jsonb, rank real)
language sql
stable
as $$
  select e.id, e.name, e.entry_type, e.summary, e.fields,
         ts_rank(e.search_vector, plainto_tsquery('english', p_query)) as rank
  from public.story_bible_entries e
  where e.project_id = p_project_id
    and e.deleted_at is null
    and e.search_vector @@ plainto_tsquery('english', p_query)
  order by rank desc
  limit p_limit;
$$;
