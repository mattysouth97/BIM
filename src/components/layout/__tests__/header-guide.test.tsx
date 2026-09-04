import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "../header";
import { useAppStore } from "@/store/app-store";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

afterEach(cleanup);

/**
 * `/` is the model gallery, so the header's one primary action points at step
 * 1 of the workflow — the register lookup's own address — rather than at home.
 * The wordmark is what goes home.
 *
 * The gallery itself is deliberately bare: both the diagnostic action and the
 * API-key control are hidden there and kept on every other page.
 */
const REGISTER_URL = "/diagnostics/new?method=ledger";

describe("Header diagnostic control", () => {
  beforeEach(() => {
    navigation.pathname = "/diagnostics/new";
    useAppStore.setState({ language: "en" });
  });

  it("exposes the single primary product destination", () => {
    render(<Header />);
    const link = screen.getByRole("link", { name: "New Energy Diagnostic" });
    expect(link.getAttribute("href")).toBe(REGISTER_URL);
    expect(screen.queryByRole("button", { name: "Guide / Help" })).toBeNull();

    // The gallery is still reachable, but as home rather than as the action.
    expect(
      screen.getByRole("link", { name: "BIMFIT home" }).getAttribute("href"),
    ).toBe("/");
  });

  it("strips the diagnostic action and the API key control on the gallery", () => {
    navigation.pathname = "/";
    render(<Header />);
    expect(
      screen.queryByRole("link", { name: "New Energy Diagnostic" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "API key settings" }),
    ).toBeNull();

    // What survives: the wordmark home link, language, and theme.
    expect(screen.getByRole("link", { name: "BIMFIT home" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "한국어로 전환" })).toBeTruthy();
  });

  it("hides the marketing header in the full-screen building workspace", () => {
    navigation.pathname = "/building/example";
    render(<Header />);
    expect(screen.queryByRole("banner")).toBeNull();
  });

  it("localizes the primary action's visible and accessible label", () => {
    useAppStore.setState({ language: "ko" });
    render(<Header />);
    const link = screen.getByRole("link", { name: "새 에너지 진단" });
    expect(link.getAttribute("href")).toBe(REGISTER_URL);
    expect(screen.getAllByText("새 에너지 진단").length).toBeGreaterThan(0);
  });

  it("hides both controls on a model page, as it does on the gallery", () => {
    // A model detail page shows one building and takes no input. It is a leaf,
    // like the gallery, so it carries the same bare header — ADR-004 removed
    // the diagnostic action from the gallery for exactly this reason, and the
    // API key belongs with the register lookup that needs one, not over a
    // static model.
    navigation.pathname = "/models/bs-medical-dental-clinic";
    render(<Header />);

    expect(screen.queryByRole("link", { name: "New Energy Diagnostic" })).toBeNull();
    expect(screen.queryByRole("button", { name: /API key/i })).toBeNull();

    // The wordmark still goes home, and the leaf is not stripped of everything.
    expect(
      screen.getByRole("link", { name: "BIMFIT home" }).getAttribute("href"),
    ).toBe("/");
  });

  it("keeps both controls on a page that IS a door into the product", () => {
    // The guard is `startsWith("/models/")`, so this is the assertion that
    // stops it widening into every page by accident.
    navigation.pathname = "/diagnostics/new";
    render(<Header />);

    expect(screen.getByRole("link", { name: "New Energy Diagnostic" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /API key/i })).toBeTruthy();
  });
});
