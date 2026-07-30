import { ESLint } from "eslint";
import process from "node:process";

process.env.CHECK_BOUNDARY_FIXTURE = "1";

const eslint = new ESLint({
  cwd: process.cwd(),
  errorOnUnmatchedPattern: true,
});
const results = await eslint.lintFiles([
  "scripts/fixtures/boundaries/domain/illegal-db-import.ts",
]);
const messages = results.flatMap((result) => result.messages);
const boundaryViolation = messages.find(
  (message) => message.ruleId === "boundaries/dependencies",
);

if (!boundaryViolation) {
  console.error(
    "Boundary negatif fixture beklenen boundaries/dependencies ihlalini üretmedi.",
  );
  process.exit(1);
}

console.log(
  `Boundary negatif fixture beklenen lint hatasını üretti: ${boundaryViolation.ruleId}.`,
);
