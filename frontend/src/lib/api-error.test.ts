import { describe, expect, it } from "vitest";
import { ApiError, parseApiError } from "./api-error";

describe("parseApiError", () => {
  it("keeps a plain sentence as the message, with no code", () => {
    const err = parseApiError('{"detail":"Out of scope."}', 403, "fallback");
    expect(err).toBeInstanceOf(ApiError);
    expect([err.message, err.code, err.status]).toEqual(["Out of scope.", null, 403]);
  });

  it("reads a coded refusal with its values", () => {
    const err = parseApiError(
      '{"detail":{"code":"lead.ref_exists","message":"A lead with reference \\"L9\\" already exists.","params":{"ref":"L9","n":2,"junk":[1]}}}',
      409,
      "fallback",
    );
    expect(err.code).toBe("lead.ref_exists");
    expect(err.params).toEqual({ ref: "L9", n: 2 });
    expect(err.message).toContain("L9");
  });

  it("names the fields of a validation error", () => {
    const body = JSON.stringify({
      detail: [
        { loc: ["body", "admin_email"], msg: "value is not a valid email address" },
        { loc: ["body", "slug"], msg: "String should match pattern" },
      ],
    });
    const err = parseApiError(body, 422, "fallback");
    expect(err.code).toBe("validation");
    expect(err.params).toEqual({ fields: "admin_email, slug" });
    expect(err.message).toBe("value is not a valid email address; String should match pattern");
  });

  it("falls back on an empty or non-JSON body", () => {
    expect(parseApiError("", 500, "GET /x failed (500)").message).toBe("GET /x failed (500)");
    expect(parseApiError("<html>Bad gateway</html>", 502, "fallback").message).toBe("<html>Bad gateway</html>");
  });
});
