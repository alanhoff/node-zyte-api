import assert from "node:assert/strict";
import test from "node:test";
import type { ExtractRequest, ExtractResponse, ZyteClient } from "../src/index.ts";

const validExtractRequest = {
  product: true,
  productOptions: { model: "2024-09-16" },
  tags: { source: "type-test" },
  url: "https://example.com/product/1",
} satisfies ExtractRequest;

const validFreeFormExtractRequest = {
  customAttributes: {
    answer: { description: "The answer", type: "string" },
  },
  echoData: { traceId: "abc123" },
  url: "https://example.com/",
} satisfies ExtractRequest;

const invalidTopLevelExtractRequest = {
  // @ts-expect-error Extra top-level extract request keys are rejected.
  notARealZyteField: true,
  url: "https://example.com/",
} satisfies ExtractRequest;

const invalidNestedExtractRequest = {
  productOptions: {
    // @ts-expect-error Nested schema-defined extract option objects reject extra keys.
    madeUpOption: true,
    model: "2024-09-16",
  },
  url: "https://example.com/",
} satisfies ExtractRequest;

function assertExtractMethodTypes(client: ZyteClient): Promise<ExtractResponse> {
  return client.extract(validExtractRequest);
}

function assertExtractResponseTypes(response: ExtractResponse): void {
  const url: string = response.url;
  void url;

  // @ts-expect-error Unknown top-level response fields are not indexable.
  // biome-ignore lint/complexity/useLiteralKeys: Bracket access proves no index signature exists.
  response["notAResponseField"];

  if (response.product) {
    // @ts-expect-error Schema-defined nested response objects reject unknown fields.
    // biome-ignore lint/complexity/useLiteralKeys: Bracket access proves no index signature exists.
    response.product["notAProductField"];
  }
}

void validExtractRequest;
void validFreeFormExtractRequest;
void invalidTopLevelExtractRequest;
void invalidNestedExtractRequest;
void assertExtractMethodTypes;
void assertExtractResponseTypes;

test("extract request type examples are runtime-safe fixtures", () => {
  assert.equal(validExtractRequest.url, "https://example.com/product/1");
  assert.equal(validFreeFormExtractRequest.url, "https://example.com/");
});
