import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/app-store";
import { CorpusBrowser } from "../corpus-browser";
import { recordFixture, releaseFixture } from "./fixtures";

beforeEach(() => useAppStore.setState({ language: "en" }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const reply = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body });

it("shows an honest empty publication state without generated stand-in records", async () => {
  vi.stubGlobal("fetch", vi.fn(() => reply({ releases: [] })));
  render(<CorpusBrowser />);
  expect(await screen.findByTestId("corpus-empty")).toBeDefined();
  expect(screen.queryByTestId("corpus-record")).toBeNull();
  expect(screen.queryByTestId("corpus-download")).toBeNull();
});

it("distinguishes a failed store from an empty release", async () => {
  vi.stubGlobal("fetch", vi.fn(() => reply({ error: "corpus_unavailable" }, false)));
  render(<CorpusBrowser />);
  expect(await screen.findByTestId("corpus-unavailable")).toBeDefined();
  expect(screen.queryByTestId("corpus-empty")).toBeNull();
});

it("queries actual release filters and pagination and keeps provenance beside modeled results", async () => {
  const fetcher = vi.fn((url: string) => url === "/api/corpus/releases" ? reply({ releases: [releaseFixture] }) : reply({ releaseId: releaseFixture.releaseId, records: [recordFixture()], total: 21, page: new URL(url, "http://local").searchParams.get("page") === "2" ? 2 : 1, pageSize: 20, totalPages: 2 }));
  vi.stubGlobal("fetch", fetcher);
  render(<CorpusBrowser />);
  await screen.findByTestId("corpus-record");
  expect(screen.getByText("wallUValue").parentElement?.textContent).toContain("assumed · references: 0 · wall-era");
  expect(screen.getByText("Approval year", { exact: false }).textContent).toContain("Unavailable");
  expect(screen.getByTestId("corpus-download").getAttribute("href")).toBe(`/api/corpus/releases/${releaseFixture.releaseId}/download`);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url.includes("page=2"))).toBe(true));
  fireEvent.change(screen.getByTestId("corpus-region"), { target: { value: "26" } });
  fireEvent.change(screen.getByTestId("corpus-use"), { target: { value: "03000" } });
  fireEvent.change(screen.getByTestId("corpus-era"), { target: { value: "post-2016" } });
  fireEvent.change(screen.getByTestId("corpus-search"), { target: { value: "  kr-ledger-123  " } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() => {
    const url = fetcher.mock.calls.at(-1)?.[0] ?? "";
    expect(url).toContain("page=1"); expect(url).toContain("region=26"); expect(url).toContain("useType=03000"); expect(url).toContain("era=post-2016"); expect(url).toContain("q=kr-ledger-123");
  });
});

it("clears stale record results when a filtered request fails", async () => {
  const fetcher = vi.fn((url: string) => url === "/api/corpus/releases" ? reply({ releases: [releaseFixture] }) : url.includes("region=26") ? reply({ error: "corpus_unavailable" }, false) : reply({ releaseId: releaseFixture.releaseId, records: [recordFixture()], total: 1, page: 1, pageSize: 20, totalPages: 1 }));
  vi.stubGlobal("fetch", fetcher);
  render(<CorpusBrowser />);
  await screen.findByTestId("corpus-record");
  fireEvent.change(screen.getByTestId("corpus-region"), { target: { value: "26" } });
  await screen.findByRole("alert");
  expect(screen.queryByTestId("corpus-record")).toBeNull();
});
