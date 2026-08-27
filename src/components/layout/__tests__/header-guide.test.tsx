import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "../header";
import { useAppStore } from "@/store/app-store";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

afterEach(cleanup);

describe("Header diagnostic control", () => {
  beforeEach(() => {
    navigation.pathname = "/";
    useAppStore.setState({ language: "en" });
  });

  it("exposes the single primary product destination", () => {
    render(<Header />);
    const link = screen.getByRole("link", { name: "New Energy Diagnostic" });
    expect(link.getAttribute("href")).toBe("/");
    expect(screen.queryByRole("button", { name: "Guide / Help" })).toBeNull();
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
    expect(link.getAttribute("href")).toBe("/");
    expect(screen.getAllByText("새 에너지 진단").length).toBeGreaterThan(0);
  });
});
