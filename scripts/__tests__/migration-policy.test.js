import { describe, expect, it } from "vitest";
import {
  canonicalizeSchemaDump,
  findForbiddenMigrationPatterns,
  findForbiddenSeedPatterns,
  parsePostgresMajor,
} from "../lib/migration-policy.mjs";

describe("B004 migration policy", () => {
  it("accepts a schema and role-only foundation", () => {
    const sql = `
      create schema if not exists app_private;
      create role pfos_runtime nologin;
    `;
    expect(findForbiddenMigrationPatterns(sql, { foundation: true })).toEqual(
      [],
    );
  });

  it.each([
    "drop table example;",
    "truncate example;",
    "alter table example rename to renamed;",
    "create table transactions (id uuid);",
    "create extension pgcrypto;",
  ])("rejects forbidden SQL: %s", (sql) => {
    expect(
      findForbiddenMigrationPatterns(sql, { foundation: true }).length,
    ).toBeGreaterThan(0);
  });

  it("rejects row-writing B004 seeds", () => {
    expect(
      findForbiddenSeedPatterns("insert into example values (1);"),
    ).toEqual(["B004 seed satır yazan DML/COPY ifadesi içeremez."]);
  });

  it("canonicalizes volatile pg_dump lines deterministically", () => {
    const first = canonicalizeSchemaDump(`
      -- Dumped from database version 17.6
      \\restrict random-one
      SET statement_timeout = 0;
      CREATE SCHEMA app_private;
      \\unrestrict random-one
    `);
    const second = canonicalizeSchemaDump(`
      -- Dumped from database version 17.7
      \\restrict random-two
      SET statement_timeout = 0;
      CREATE SCHEMA app_private;
      \\unrestrict random-two
    `);
    expect(first).toBe(second);
  });

  it("extracts the PostgreSQL server major", () => {
    expect(parsePostgresMajor("-- Dumped from database version 17.6")).toBe(17);
  });
});
