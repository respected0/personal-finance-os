import nextVitals from "eslint-config-next/core-web-vitals";
import boundaries from "eslint-plugin-boundaries";
import { createRequire } from "node:module";

const requireFromEslint = createRequire(import.meta.resolve("eslint"));
const espree = requireFromEslint("espree");
const incompatiblePluginPrefixes = [
  "react/",
  "react-hooks/",
  "import/",
  "jsx-a11y/",
  "@typescript-eslint/",
];
const compatibleNextVitals = nextVitals
  .filter((config) => config.name !== "next/typescript")
  .map((config) => ({
    ...config,
    ...(config.languageOptions?.parser
      ? {
          languageOptions: {
            ...config.languageOptions,
            parser: espree,
          },
        }
      : {}),
    ...(config.plugins
      ? {
          plugins: Object.fromEntries(
            Object.entries(config.plugins).filter(
              ([pluginName]) => pluginName === "@next/next",
            ),
          ),
        }
      : {}),
    ...(config.rules
      ? {
          rules: Object.fromEntries(
            Object.entries(config.rules).filter(
              ([ruleName]) =>
                !incompatiblePluginPrefixes.some((prefix) =>
                  ruleName.startsWith(prefix),
                ),
            ),
          ),
        }
      : {}),
  }));

const publicExportPatterns = [
  "@personal-finance-os/*/src",
  "@personal-finance-os/*/src/**",
  "**/packages/*/src",
  "**/packages/*/src/**",
  "../**/packages/*/src/**",
  "../../**/packages/*/src/**",
  "../../../**/packages/*/src/**",
  "../../../../**/packages/*/src/**",
];

const fixtureIgnore =
  process.env.CHECK_BOUNDARY_FIXTURE === "1"
    ? []
    : ["scripts/fixtures/boundaries/**"];

export default [
  {
    ignores: [
      "**/.next/**",
      "**/dist/**",
      "coverage/**",
      "node_modules/**",
      ...fixtureIgnore,
    ],
  },
  ...compatibleNextVitals,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
    settings: {
      next: {
        rootDir: "apps/web",
      },
    },
  },
  {
    files: [
      "apps/**/*.{js,jsx,ts,tsx}",
      "packages/**/*.{js,jsx,ts,tsx}",
      "scripts/fixtures/boundaries/**/*.{js,jsx,ts,tsx}",
    ],
    plugins: {
      boundaries,
    },
    languageOptions: {
      parser: espree,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    settings: {
      next: {
        rootDir: "apps/web",
      },
      "boundaries/elements": [
        {
          type: "app",
          pattern: "apps/*/**",
          partialMatch: false,
        },
        {
          type: "domain",
          pattern: "packages/domain/src/**",
          partialMatch: false,
        },
        {
          type: "domain",
          pattern: "scripts/fixtures/boundaries/domain/**",
          partialMatch: false,
        },
        {
          type: "db",
          pattern: "packages/db/src/**",
          partialMatch: false,
        },
        {
          type: "contracts",
          pattern: "packages/contracts/src/**",
          partialMatch: false,
        },
        {
          type: "ui",
          pattern: "packages/ui/src/**",
          partialMatch: false,
        },
        {
          type: "test-kit",
          pattern: "packages/test-kit/src/**",
          partialMatch: false,
        },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message: "Mimari paket bağımlılığı izinli değil.",
          policies: [
            {
              from: { element: { type: "app" } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: ["app", "domain", "db", "contracts", "ui"],
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: "domain" } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: ["domain", "contracts"],
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: "db" } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: ["db", "domain", "contracts"],
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: "contracts" } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: ["contracts", "domain"],
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: "ui" } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: ["ui", "domain", "contracts"],
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: "test-kit" } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: ["test-kit", "domain", "db", "contracts", "ui"],
                    },
                  },
                },
              },
            },
          ],
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: publicExportPatterns,
              message:
                "Paket kaynaklarına doğrudan girme; yalnız package.json public export’unu kullan.",
            },
            {
              group: ["@personal-finance-os/test-kit"],
              message: "Üretim kodu test-kit paketini tüketemez.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/domain/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next",
              message: "Domain katmanı Next.js’e bağımlı olamaz.",
            },
            {
              name: "react",
              message: "Domain katmanı React’e bağımlı olamaz.",
            },
            {
              name: "react-dom",
              message: "Domain katmanı React DOM’a bağımlı olamaz.",
            },
            {
              name: "@personal-finance-os/db",
              message: "Domain katmanı DB paketini tüketemez.",
            },
            {
              name: "@personal-finance-os/ui",
              message: "Domain katmanı UI paketini tüketemez.",
            },
            {
              name: "@personal-finance-os/test-kit",
              message: "Üretim kodu test-kit paketini tüketemez.",
            },
          ],
          patterns: [
            {
              group: [
                "@supabase/*",
                "drizzle-orm",
                "drizzle-orm/**",
                ...publicExportPatterns,
              ],
              message:
                "Domain katmanı framework, DB, UI veya paket içi kaynaklara bağımlı olamaz.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/ui/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@personal-finance-os/db",
              message: "UI paketi DB paketini tüketemez.",
            },
            {
              name: "@personal-finance-os/test-kit",
              message: "UI paketi test-kit paketini tüketemez.",
            },
          ],
          patterns: [
            {
              group: publicExportPatterns,
              message:
                "Paket kaynaklarına doğrudan girme; yalnız package.json public export’unu kullan.",
            },
          ],
        },
      ],
    },
  },
];
