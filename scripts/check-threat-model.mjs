import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const expectedIds = Array.from(
  { length: 16 },
  (_, index) => `T-${String(index + 1).padStart(2, "0")}`,
);
const requiredFields = [
  "id",
  "başlık",
  "önem",
  "varlık/veri sınıfı",
  "güven sınırı",
  "tehdit senaryosu",
  "kontrol/azaltım",
  "kontrol sahibi rol",
  "uygulayacak backlog ID",
  "doğrulama testi",
  "kalan risk",
  "durum",
];
const allowedSeverities = new Set(["Kritik", "Yüksek"]);
const forbiddenImplementedStatuses = new Set([
  "Uygulandı",
  "Tamamlandı",
  "Implemented",
  "Done",
]);
const errors = [];

const requiredDocuments = [
  "docs/architecture/threat-model.md",
  "docs/architecture/data-classification.md",
  "docs/architecture/security-control-ownership.md",
  "docs/architecture/threat-register.json",
];
for (const document of requiredDocuments) {
  try {
    await access(path.resolve(document));
  } catch {
    errors.push(`${document}: zorunlu B006 belgesi eksik.`);
  }
}

const register = JSON.parse(
  await readFile("docs/architecture/threat-register.json", "utf8"),
);
const threats = register.threats;
if (!Array.isArray(threats)) {
  errors.push("threat-register.json: threats alanı dizi olmalı.");
}

for (const threat of Array.isArray(threats) ? threats : []) {
  for (const field of requiredFields) {
    if (
      typeof threat[field] !== "string" ||
      threat[field].trim().length === 0
    ) {
      errors.push(`${threat.id ?? "kimliksiz kayıt"}: ${field} alanı boş.`);
    }
  }
  if (!allowedSeverities.has(threat["önem"])) {
    errors.push(
      `${threat.id}: geçersiz önem seviyesi (${threat["önem"] ?? "boş"}).`,
    );
  }
  if (
    typeof threat["uygulayacak backlog ID"] === "string" &&
    !/^B\d{3}(, B\d{3})*$/u.test(threat["uygulayacak backlog ID"])
  ) {
    errors.push(
      `${threat.id}: backlog eşlemesi BNNN biçiminde olmalı (${threat["uygulayacak backlog ID"]}).`,
    );
  }
  if (forbiddenImplementedStatuses.has(threat["durum"])) {
    errors.push(
      `${threat.id}: B006 sonraki kontrolü uygulanmış gösteremez (${threat["durum"]}).`,
    );
  }
}

const ids = (Array.isArray(threats) ? threats : [])
  .map((threat) => threat.id)
  .sort();
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length > 0) {
  errors.push(
    `Tekrarlanan tehdit kimlikleri: ${[...new Set(duplicateIds)].join(", ")}`,
  );
}
if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
  errors.push(
    `Tehdit aralığı eksiksiz T-01–T-16 olmalı; bulunan: ${ids.join(", ")}.`,
  );
}

const criticalThreats = (Array.isArray(threats) ? threats : []).filter(
  (threat) => threat["önem"] === "Kritik",
);
for (const threat of criticalThreats) {
  for (const field of [
    "kontrol/azaltım",
    "kontrol sahibi rol",
    "uygulayacak backlog ID",
    "doğrulama testi",
  ]) {
    if (!threat[field]?.trim()) {
      errors.push(`${threat.id}: kritik tehditte ${field} zorunlu.`);
    }
  }
}

const classification = await readFile(
  "docs/architecture/data-classification.md",
  "utf8",
);
for (const dataClass of [
  "Çok hassas",
  "Finansal hassas",
  "Kişisel",
  "Operasyonel",
]) {
  if (!classification.includes(dataClass)) {
    errors.push(`Veri sınıfı eksik: ${dataClass}.`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(
  `Threat model doğrulaması başarılı: ${ids.length} benzersiz kayıt, ${criticalThreats.length} kritik tehdidin azaltım/sahip/backlog/test alanları atanmış.`,
);
