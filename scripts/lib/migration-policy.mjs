const destructivePatterns = [
  ["DROP TABLE", /\bdrop\s+table\b/i],
  ["DROP SCHEMA", /\bdrop\s+schema\b/i],
  ["TRUNCATE", /\btruncate\b/i],
  [
    "ALTER TABLE ... DROP COLUMN/CONSTRAINT",
    /\balter\s+table\b[\s\S]*?\bdrop\s+(?:column|constraint)\b/i,
  ],
  ["ALTER TABLE ... RENAME", /\balter\s+table\b[\s\S]*?\brename\b/i],
  ["DELETE FROM", /\bdelete\s+from\b/i],
];

export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ");
}

function stripReviewedRuntimeUserPurge(sql) {
  return sql.replace(
    /-- migration-policy: begin reviewed-runtime-user-purge\s+([\s\S]*?)-- migration-policy: end reviewed-runtime-user-purge/g,
    (block) => {
      const isExactAccountPurge =
        /create\s+function\s+app_identity\.purge_due_account_deletion\s*\(p_id\s+uuid\)/i.test(
          block,
        ) &&
        /security\s+definer/i.test(block) &&
        /set\s+search_path\s*=\s*pg_catalog,\s*app_identity,\s*app_private,\s*auth/i.test(
          block,
        ) &&
        /v_user_id\s+uuid\s*:=\s*auth\.uid\(\)/i.test(block);
      return isExactAccountPurge ? "reviewed runtime user purge" : block;
    },
  );
}

export function findForbiddenMigrationPatterns(
  sql,
  { foundation = false } = {},
) {
  const executableSql = stripSqlComments(stripReviewedRuntimeUserPurge(sql));
  const errors = destructivePatterns
    .filter(([, pattern]) => pattern.test(executableSql))
    .map(([name]) => `Yasak destructive migration kalıbı: ${name}.`);

  const extensionStatements =
    executableSql.match(/\bcreate\s+extension\b[^;]*;/gi) ?? [];
  for (const statement of extensionStatements) {
    if (!/\bversion\s+'[^']+'/i.test(statement)) {
      errors.push("CREATE EXTENSION açık VERSION olmadan kullanılamaz.");
    }
  }

  if (foundation && /\bcreate\s+(?:unlogged\s+)?table\b/i.test(executableSql)) {
    errors.push("B004 foundation migration uygulama tablosu oluşturamaz.");
  }

  return errors;
}

export function findForbiddenSeedPatterns(sql) {
  const executableSql = stripSqlComments(sql);
  const rowWritingPattern = /\b(insert|update|delete|merge|copy)\b/i;
  return rowWritingPattern.test(executableSql)
    ? ["B004 seed satır yazan DML/COPY ifadesi içeremez."]
    : [];
}

export function canonicalizeSchemaDump(sql) {
  return sql
    .replace(/^\s*\\(?:un)?restrict.*$/gm, "")
    .replace(/^\s*--.*$/gm, "")
    .replace(/^\s*SET\s+.*;\s*$/gim, "")
    .replace(/^\s*SELECT\s+pg_catalog\.set_config\([^;]+;\s*$/gim, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .concat("\n");
}

export function parsePostgresMajor(schemaDump) {
  const match = schemaDump.match(
    /Dumped from database version\s+([0-9]+)(?:\.[0-9]+)*/i,
  );
  return match ? Number(match[1]) : null;
}
