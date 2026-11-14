import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HideOnReadOnlyVisit, ReadOnlyVisitProvider } from "./read-only-visit";

function tree(readOnly: boolean | null, fallback?: string) {
  const guarded = createElement(HideOnReadOnlyVisit, {
    fallback: fallback ? createElement("span", null, fallback) : undefined,
    children: createElement("button", null, "Remove"),
  });
  return readOnly === null ? guarded : createElement(ReadOnlyVisitProvider, { readOnly, children: guarded });
}

afterEach(cleanup);

describe("HideOnReadOnlyVisit", () => {
  it("shows the control outside a provider", () => {
    render(tree(null));
    expect(screen.queryByText("Remove")).not.toBeNull();
  });

  it("shows the control to a real member", () => {
    render(tree(false));
    expect(screen.queryByText("Remove")).not.toBeNull();
  });

  it("hides the control during a read-only visit", () => {
    render(tree(true));
    expect(screen.queryByText("Remove")).toBeNull();
  });

  it("renders the fallback instead during a visit", () => {
    render(tree(true, "Read-only"));
    expect(screen.queryByText("Remove")).toBeNull();
    expect(screen.queryByText("Read-only")).not.toBeNull();
  });
});
