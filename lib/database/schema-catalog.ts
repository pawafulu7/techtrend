/** Definitions use names/SQL rather than database-specific OIDs; replay and target share a server. */
export const SCHEMA_ARTIFACT_SQL = `
  SELECT 'index' AS kind, c.relname AS name,
    jsonb_build_object('table', t.relname, 'definition', pg_get_indexdef(c.oid),
      'method', am.amname, 'unique', i.indisunique, 'primary', i.indisprimary,
      'valid', i.indisvalid, 'ready', i.indisready, 'keyCount', i.indnkeyatts,
      'columnCount', i.indnatts,
      'keys', ARRAY(SELECT pg_get_indexdef(c.oid, k, false) FROM generate_series(1, i.indnkeyatts) k),
      'opclasses', ARRAY(SELECT ns.nspname || '.' || op.opcname
        FROM unnest(i.indclass::oid[]) WITH ORDINALITY u(oid, ord)
        JOIN pg_opclass op ON op.oid = u.oid JOIN pg_namespace ns ON ns.oid = op.opcnamespace
        ORDER BY u.ord),
      'predicate', pg_get_expr(i.indpred, i.indrelid),
      'options', ARRAY(SELECT option FROM unnest(c.reloptions) option ORDER BY option)) AS details
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_am am ON am.oid = c.relam
  WHERE n.nspname = 'public' AND t.relname <> '_prisma_migrations'
  UNION ALL
  SELECT 'check', t.relname || '.' || c.conname,
    jsonb_build_object('definition', pg_get_constraintdef(c.oid), 'valid', c.convalidated)
  FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND c.contype = 'c'
  UNION ALL
  SELECT 'trigger', t.relname || '.' || g.tgname,
    jsonb_build_object('definition', pg_get_triggerdef(g.oid), 'enabled', g.tgenabled)
  FROM pg_trigger g JOIN pg_class t ON t.oid = g.tgrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND NOT g.tgisinternal
  UNION ALL
  SELECT 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    jsonb_build_object('definition', pg_get_functiondef(p.oid))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  UNION ALL
  SELECT 'extension', e.extname, jsonb_build_object('version', e.extversion, 'schema', n.nspname)
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  UNION ALL
  SELECT 'view', v.viewname, jsonb_build_object('definition', v.definition)
  FROM pg_views v WHERE v.schemaname = 'public'
  UNION ALL
  SELECT 'materialized-view', v.matviewname, jsonb_build_object('definition', v.definition)
  FROM pg_matviews v WHERE v.schemaname = 'public'
  ORDER BY kind, name
`;

/** Covers ordinary-vs-UNIQUE redundancy too; expression, order, operator and predicate must match. */
export const DUPLICATE_INDEX_SQL = `
  SELECT t.relname::text AS table_name, array_agg(c.relname::text ORDER BY c.relname) AS names
  FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_class c ON c.oid = i.indexrelid
  WHERE n.nspname = 'public' AND t.relname IN ('Article', 'Tag', 'Session')
  GROUP BY t.relname, c.relam, i.indkey, i.indclass, i.indcollation, i.indoption,
    pg_get_expr(i.indexprs, i.indrelid), pg_get_expr(i.indpred, i.indrelid)
  HAVING COUNT(*) > 1
`;
