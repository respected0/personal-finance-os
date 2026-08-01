import { openApiRoot, runRedocly } from "./common.mjs";

runRedocly(["lint", openApiRoot, "--config", ".redocly.yaml"]);
console.log("OpenAPI 3.1 lint: PASS");
