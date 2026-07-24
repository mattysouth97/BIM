import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "../header";
import {
  GUIDE_REQUEST_EVENT,
  type GuideRequestDetail,
} from "@/lib/guide-events";
import { useAppStore } from "@/store/app-store";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

afterEach(cleanup);

describe("Header guide control", () => {
  beforeEach(() => {
    navigation.pathname = "/";
    useAppStore.setState({ language: "en" });
  });

  it("dispatches the typed global guide request event", () => {
    const listener = vi.fn<(event: CustomEvent<GuideRequestDetail>) => void>();
    window.addEventListener(GUIDE_REQUEST_EVENT, listener);

    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: "Guide / Help" }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({ source: "header" });
    window.removeEventListener(GUIDE_REQUEST_EVENT, listener);
  });

  it("is hidden outside home and building routes", () => {
    navigation.pathname = "/releases";
    render(<Header />);

    expect(
      screen.queryByRole("button", { name: "Guide / Help" }),
    ).toBeNull();
  });

  it("localizes its visible and accessible label", () => {
    useAppStore.setState({ language: "ko" });
    render(<Header />);

    expect(
      screen
        .getByRole("button", { name: "가이드 / 도움말" })
        .getAttribute("title"),
    ).toBe("가이드 / 도움말");
    expect(screen.getByText("가이드")).toBeTruthy();
  });
});
