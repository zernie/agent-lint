/**
 * vigiles generate-schema — emit a JSON Schema for `vigiles:` frontmatter.
 *
 * Sibling of `generate-types` (which emits a `.d.ts` for the spec.ts path).
 * This emits `.vigiles/schema.json` so a YAML LSP can autocomplete rule
 * names and squiggle typos in markdown frontmatter:
 *
 *   ---
 *   # yaml-language-server: $schema=./.vigiles/schema.json
 *   vigiles:
 *     enforce:
 *       - rule: eslint/no-consolee   # red squiggle in VS Code
 *   ---
 *
 * The `rule` enum is populated from the project's ACTUAL enabled linter
 * rules — the same discovery `generate-types` runs — so the schema reflects
 * what is really enforceable, not a static catalog.
 */

import { generateTypes } from "./generate-types.js";

export interface GenerateSchemaOptions {
  basePath?: string;
}

export interface GenerateSchemaResult {
  /** The JSON Schema document. */
  schema: Record<string, unknown>;
  /** Pretty-printed JSON, newline-terminated. */
  json: string;
  /** Rule names included in the enum (sorted, deduped). */
  ruleNames: string[];
  /** Linters discovered, with rule counts. */
  linters: { linter: string; count: number }[];
}

/**
 * Build a JSON Schema for the `vigiles:` frontmatter block from the
 * project's discovered linter rules. When no rules are discoverable the
 * `rule` field falls back to a freeform string so the schema never
 * false-flags a valid reference.
 */
export function generateSchema(
  options: GenerateSchemaOptions = {},
): GenerateSchemaResult {
  const basePath = options.basePath ?? process.cwd();
  const { linters } = generateTypes({ basePath });

  const ruleNames = new Set<string>();
  for (const { linter, rules } of linters) {
    for (const rule of rules) {
      ruleNames.add(`${linter}/${rule}`);
      // ESLint also accepts scoped-plugin rules in bare form (the scope is
      // treated as the linter, e.g. "@typescript-eslint/no-explicit-any").
      // Emit both so neither form produces a false squiggle.
      if (linter === "eslint" && rule.includes("/")) {
        ruleNames.add(rule);
      }
    }
  }
  const sorted = [...ruleNames].sort();

  const ruleSchema: Record<string, unknown> =
    sorted.length > 0 ? { enum: sorted } : { type: "string" };

  const schema: Record<string, unknown> = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://vigiles.dev/frontmatter.schema.json",
    title: "vigiles frontmatter",
    description:
      "vigiles enforce rules declared in markdown YAML frontmatter (Level 1).",
    type: "object",
    properties: {
      vigiles: {
        type: "object",
        additionalProperties: false,
        properties: {
          enforce: {
            type: "array",
            description:
              "Linter rules to enforce, verified by `vigiles audit`.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["rule", "why"],
              properties: {
                rule: {
                  description:
                    "Linter rule reference, e.g. eslint/no-console. Verified to exist AND be enabled.",
                  ...ruleSchema,
                },
                why: {
                  type: "string",
                  description:
                    "Why this rule is enforced — shown to the agent as context.",
                },
              },
            },
          },
        },
      },
    },
  };

  return {
    schema,
    json: JSON.stringify(schema, null, 2) + "\n",
    ruleNames: sorted,
    linters: linters.map((l) => ({ linter: l.linter, count: l.rules.length })),
  };
}
