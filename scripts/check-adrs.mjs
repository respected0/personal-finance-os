import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const adrDirectory = path.resolve("docs/architecture/adr");
const expectedIds = Array.from(
  { length: 16 },
  (_, index) => `ADR-${String(index + 1).padStart(3, "0")}`,
);
const allowedStatuses = new Set(["Accepted", "Superseded"]);

const files = (await readdir(adrDirectory))
  .filter((file) => /^ADR-\d{3}-.+\.md$/u.test(file))
  .sort();

const errors = [];
const records = [];

for (const file of files) {
  const filenameId = file.match(/^(ADR-\d{3})-/u)?.[1];
  const content = await readFile(path.join(adrDirectory, file), "utf8");
  const headingId = content.match(/^# (ADR-\d{3}) — /mu)?.[1];
  const status = content.match(/^- Durum: (.+)$/mu)?.[1]?.trim();
  const date = content.match(/^- Tarih: (\d{4}-\d{2}-\d{2})$/mu)?.[1];

  if (filenameId !== headingId) {
    errors.push(`${file}: dosya kimliği ile başlık kimliği eşleşmiyor.`);
  }
  if (!status || !allowedStatuses.has(status)) {
    errors.push(
      `${file}: durum Accepted veya Superseded olmalı; bulunan: ${status ?? "boş"}.`,
    );
  }
  if (!date) {
    errors.push(`${file}: ISO tarih alanı eksik.`);
  }
  for (const section of ["Bağlam", "Karar", "Sonuçlar", "Kaynak"]) {
    if (!content.includes(`## ${section}`)) {
      errors.push(`${file}: ${section} bölümü eksik.`);
    }
  }
  if (status === "Superseded" && !/Yerine geçen: ADR-\d{3}/u.test(content)) {
    errors.push(`${file}: Superseded kayıt yerine geçen ADR’yi göstermeli.`);
  }

  records.push({ id: filenameId, file, status });
}

const ids = records.map(({ id }) => id);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length > 0) {
  errors.push(
    `Tekrarlanan ADR kimlikleri: ${[...new Set(duplicateIds)].join(", ")}`,
  );
}
if (files.length !== expectedIds.length) {
  errors.push(`ADR sayısı 16 olmalı; bulunan: ${files.length}.`);
}
if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
  errors.push(
    `ADR aralığı kesintisiz ADR-001–ADR-016 olmalı; bulunan: ${ids.join(", ")}.`,
  );
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

const statusSummary = records
  .map(({ id, status }) => `${id}:${status}`)
  .join(", ");
console.log(`ADR doğrulaması başarılı: ${statusSummary}`);
