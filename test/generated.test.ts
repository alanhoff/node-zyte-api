import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { openApiSchemaNames } from "../src/generated/openapi-types.ts";

test("generated OpenAPI types represent every schema from the Zyte spec", async () => {
  const spec = JSON.parse(
    await readFile(new URL("../.omx/zyte-openapi.json", import.meta.url), "utf8"),
  ) as {
    components: { schemas: Record<string, unknown> };
    paths?: {
      "/extract"?: {
        post?: {
          requestBody?: { content?: { "application/json"?: { schema?: { $ref?: string } } } };
          responses?: {
            "200"?: { content?: { "application/json"?: { schema?: { $ref?: string } } } };
          };
        };
      };
    };
    servers?: ReadonlyArray<{ url?: string }>;
  };
  assert.deepEqual([...openApiSchemaNames].sort(), Object.keys(spec.components.schemas).sort());
  assert.equal(openApiSchemaNames.length, 101);
  assert.equal(spec.servers?.[0]?.url, "https://api.zyte.com/v1");
  assert.equal(
    spec.paths?.["/extract"]?.post?.requestBody?.content?.["application/json"]?.schema?.$ref,
    "#/components/schemas/ExtractRequest",
  );
  assert.equal(
    spec.paths?.["/extract"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref,
    "#/components/schemas/Response200",
  );
});
