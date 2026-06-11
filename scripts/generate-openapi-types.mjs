#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const SPEC_PATH = new URL("../openapi/zyte-openapi.json", import.meta.url);
const OUTPUT_PATH = new URL("../src/generated/openapi-types.ts", import.meta.url);

const primitiveTypes = new Map([
  ["string", "string"],
  ["integer", "number"],
  ["number", "number"],
  ["boolean", "boolean"],
  ["null", "null"],
]);

const reservedWords = new Set([
  "abstract",
  "any",
  "as",
  "asserts",
  "async",
  "await",
  "bigint",
  "boolean",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "constructor",
  "continue",
  "debugger",
  "declare",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "get",
  "if",
  "implements",
  "import",
  "in",
  "infer",
  "instanceof",
  "interface",
  "is",
  "keyof",
  "let",
  "module",
  "namespace",
  "never",
  "new",
  "null",
  "number",
  "object",
  "of",
  "package",
  "private",
  "protected",
  "public",
  "readonly",
  "require",
  "return",
  "satisfies",
  "set",
  "static",
  "string",
  "super",
  "switch",
  "symbol",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "unique",
  "unknown",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTypeName(name, usedNames) {
  const candidate =
    name
      .split(/[^A-Za-z0-9]+/u)
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
      .join("") || "Schema";
  const safeCandidate = /^[A-Za-z_]/u.test(candidate) ? candidate : `Schema${candidate}`;
  const base = reservedWords.has(safeCandidate) ? `${safeCandidate}Schema` : safeCandidate;
  let suffix = 2;
  let safeName = base;
  while (usedNames.has(safeName)) {
    safeName = `${base}${suffix}`;
    suffix += 1;
  }
  usedNames.add(safeName);
  return safeName;
}

function refType(ref, names) {
  const prefix = "#/components/schemas/";
  if (!ref.startsWith(prefix)) {
    return "unknown";
  }
  return names.get(ref.slice(prefix.length)) ?? "unknown";
}

function propertyName(name) {
  return /^[A-Za-z_$][\w$]*$/u.test(name) && !reservedWords.has(name) ? name : JSON.stringify(name);
}

function literal(value) {
  return JSON.stringify(value);
}

function union(values) {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length === 0) {
    return "unknown";
  }
  if (unique.includes("unknown")) {
    return "unknown";
  }
  return unique.length === 1 ? unique[0] : unique.join(" | ");
}

function parenthesize(type) {
  return /[&|]/u.test(type) ? `(${type})` : type;
}

function schemaType(schema, names) {
  if (schema === true) {
    return "unknown";
  }
  if (schema === false) {
    return "never";
  }
  if (!isRecord(schema)) {
    return "unknown";
  }

  const nullable = schema.nullable === true ? " | null" : "";

  if (typeof schema.$ref === "string") {
    return `${refType(schema.$ref, names)}${nullable}`;
  }

  const composed = [];
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    composed.push(schema.allOf.map((item) => parenthesize(schemaType(item, names))).join(" & "));
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    composed.push(schema.oneOf.map((item) => parenthesize(schemaType(item, names))).join(" | "));
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    composed.push(schema.anyOf.map((item) => parenthesize(schemaType(item, names))).join(" | "));
  }
  if (composed.length > 0) {
    return `${composed.join(" & ")}${nullable}`;
  }

  if (Array.isArray(schema.enum)) {
    return `${union(schema.enum.map((item) => literal(item)))}${nullable}`;
  }

  const typeValue = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (typeValue.length > 1) {
    return `${union(typeValue.map((type) => schemaType({ ...schema, type }, names)))}${nullable}`;
  }

  const [type] = typeValue;
  if (type === "array") {
    return `ReadonlyArray<${schemaType(schema.items, names)}>${nullable}`;
  }

  if (type === "object" || schema.properties || schema.additionalProperties) {
    return `${objectType(schema, names)}${nullable}`;
  }

  if (type && primitiveTypes.has(type)) {
    return `${primitiveTypes.get(type)}${nullable}`;
  }

  return `unknown${nullable}`;
}

function objectType(schema, names) {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const entries = Object.entries(properties);
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const additional = schema.additionalProperties;

  if (entries.length === 0) {
    if (isRecord(additional) || additional === true) {
      return `Readonly<Record<string, ${additional === true ? "unknown" : schemaType(additional, names)}>>`;
    }
    return "Readonly<Record<string, unknown>>";
  }

  const lines = entries.map(([name, propertySchema]) => {
    const marker = required.has(name) ? "" : "?";
    return `  readonly ${propertyName(name)}${marker}: ${schemaType(propertySchema, names)};`;
  });

  if (additional !== false) {
    lines.push("  readonly [key: string]: unknown;");
  }

  return `Readonly<{\n${lines.join("\n")}\n}>`;
}

function assertSpecShape(spec) {
  if (!isRecord(spec) || spec.openapi !== "3.0.3") {
    throw new Error("Expected Zyte OpenAPI 3.0.3 spec");
  }
  if (
    !Array.isArray(spec.servers) ||
    !spec.servers.some((server) => isRecord(server) && server.url === "https://api.zyte.com/v1")
  ) {
    throw new Error("Expected Zyte production server URL in spec");
  }
  if (!isRecord(spec.paths) || !isRecord(spec.paths["/extract"])) {
    throw new Error("Expected /extract path in spec");
  }
  const post = spec.paths["/extract"].post;
  if (!isRecord(post)) {
    throw new Error("Expected POST /extract operation in spec");
  }
  const requestSchema = post.requestBody?.content?.["application/json"]?.schema?.$ref;
  const responseSchema = post.responses?.["200"]?.content?.["application/json"]?.schema?.$ref;
  if (requestSchema !== "#/components/schemas/ExtractRequest") {
    throw new Error("Expected POST /extract request body to reference ExtractRequest");
  }
  if (responseSchema !== "#/components/schemas/Response200") {
    throw new Error("Expected POST /extract 200 response to reference Response200");
  }
  if (!isRecord(spec.components) || !isRecord(spec.components.schemas)) {
    throw new Error("Expected components.schemas in spec");
  }
}

function render(spec) {
  assertSpecShape(spec);
  const schemas = spec.components.schemas;
  const names = new Map();
  const usedNames = new Set();
  for (const schemaName of Object.keys(schemas)) {
    names.set(schemaName, toTypeName(schemaName, usedNames));
  }

  const schemaTypes = Object.entries(schemas).map(([schemaName, schema]) => {
    const name = names.get(schemaName);
    return `export type ${name} = ${schemaType(schema, names)};`;
  });

  const componentLines = Object.keys(schemas).map(
    (schemaName) => `  readonly ${JSON.stringify(schemaName)}: ${names.get(schemaName)};`,
  );

  const schemaNameList = Object.keys(schemas)
    .map((name) => `  ${JSON.stringify(name)},`)
    .join("\n");

  return `${[
    "/* eslint-disable */",
    "// This file is generated by scripts/generate-openapi-types.mjs.",
    "// Do not edit it manually.",
    "",
    ...schemaTypes,
    "",
    "export type ComponentSchemas = Readonly<{",
    componentLines.join("\n"),
    "}>;",
    "",
    names.get("ExtractRequest") === "ExtractRequest"
      ? ""
      : 'export type ExtractRequest = ComponentSchemas["ExtractRequest"];',
    'export type ExtractResponse = ComponentSchemas["Response200"];',
    'export type ZyteProblem = ComponentSchemas["Problem"];',
    "",
    `export const openApiSchemaNames = [\n${schemaNameList}\n] as const;`,
    "",
    "export type OpenApiSchemaName = (typeof openApiSchemaNames)[number];",
    "",
  ].join("\n")}\n`;
}

async function readCurrentOutput() {
  try {
    return await readFile(OUTPUT_PATH, "utf8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

const spec = JSON.parse(await readFile(SPEC_PATH, "utf8"));
const output = render(spec);

if (process.argv.includes("--check")) {
  const current = await readCurrentOutput();
  if (current !== output) {
    throw new Error("Generated OpenAPI types are stale. Run npm run generate:types.");
  }
  console.log("Generated OpenAPI types are up to date.");
} else {
  await writeFile(OUTPUT_PATH, output);
  console.log(`Generated ${Object.keys(spec.components.schemas).length} schemas.`);
}
