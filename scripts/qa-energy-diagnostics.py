"""Headless visual QA for BIMFIT's protected flows and energy diagnosis.

The script assumes a server is already running. It deliberately captures the
unmodified rendered state before attempting any interaction so overlays,
empty states, and console failures remain visible evidence.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

APP_STORAGE_KEY = "korea-building-info-storage"
CALIBRATED_FLOOR_PLAN_DXF = "\n".join(
    [
        "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6",
        "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", "0", "LWPOLYLINE",
        "8", "BIM_OUTLINE", "90", "4", "70", "1", "10", "0", "20", "0",
        "10", "20", "20", "0", "10", "20", "20", "20", "10", "0", "20", "20",
        "0", "ENDSEC", "0", "EOF", "",
    ]
)


def capture(page: Page, base_url: str, route: str, output: Path, name: str) -> None:
    page.goto(f"{base_url}{route}", wait_until="networkidle")
    page.screenshot(path=str(output / f"{name}.png"), full_page=True)
    print(
        json.dumps(
            {
                "capture": name,
                "url": page.url,
                "title": page.title(),
                "buttons": page.get_by_role("button").count(),
                "links": page.get_by_role("link").count(),
            },
            ensure_ascii=False,
        )
    )


def capture_diagnosis(page: Page, base_url: str, output: Path, suffix: str) -> None:
    page.goto(f"{base_url}/studio?start=diagnose", wait_until="networkidle")
    page.get_by_test_id("energy-diagnosis-workspace").wait_for()
    page.screenshot(
        path=str(output / f"diagnosis-entry-{suffix}.png"),
        full_page=True,
    )
    page.get_by_test_id("drawing-set-input").set_input_files(
        {
            "name": "A101-office-floor-plan-rev-A.dxf",
            "mimeType": "application/dxf",
            "buffer": CALIBRATED_FLOOR_PLAN_DXF.encode("utf-8"),
        }
    )
    assumption_card = page.get_by_test_id("tier-one-assumption-card")
    assumption_card.wait_for()
    assumption_card.scroll_into_view_if_needed()
    page.screenshot(
        path=str(output / f"diagnosis-tier-one-assumptions-{suffix}.png"),
        full_page=True,
    )

    page.get_by_test_id("diagnosis-stage-systems").click()
    capacity_fact = (
        page.get_by_test_id("stage-panel-systems")
        .get_by_role("button")
        .filter(has_text="Capacity")
        .first
    )
    capacity_fact.click()
    linked_assumption = page.get_by_test_id("linked-assumption")
    linked_assumption.wait_for()
    linked_assumption.scroll_into_view_if_needed()
    page.screenshot(
        path=str(output / f"diagnosis-mixed-provenance-{suffix}.png"),
        full_page=True,
    )

    # Reload a clean in-memory workspace before opening the controlled
    # representative set; the Tier-1 model above is deliberately not saved.
    page.goto(f"{base_url}/studio?start=diagnose", wait_until="networkidle")
    page.get_by_test_id("energy-diagnosis-workspace").wait_for()
    page.get_by_role("button", name="Open representative office set").click()
    page.get_by_test_id("stage-panel-review").wait_for()
    page.screenshot(
        path=str(output / f"diagnosis-review-{suffix}.png"),
        full_page=True,
    )
    print(
        json.dumps(
            {
                "capture": f"diagnosis-review-{suffix}",
                "url": page.url,
                "documents": page.locator('[data-testid^="drawing-document-"]').count(),
                "hasSourceReview": page.get_by_test_id("source-review-canvas").count() == 1,
                "hasConflictReview": page.get_by_test_id("conflict-resolution-panel").count() == 1,
            },
            ensure_ascii=False,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument("--output", default="qa-evidence/design-stage-energy/baseline")
    args = parser.parse_args()

    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    browser_messages: list[dict[str, str]] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)

        desktop = browser.new_page(viewport={"width": 1440, "height": 1000})
        desktop.add_init_script(
            f"""
            localStorage.setItem({json.dumps(APP_STORAGE_KEY)}, JSON.stringify({{
              state: {{ language: 'en', sidePanelOpen: true, hasSeenTour: true,
                hasSeenHomeTour: true, hasSeenTwinTour: true }},
              version: 1
            }}))
            """
        )
        desktop.on(
            "console",
            lambda message: browser_messages.append(
                {"kind": "console", "level": message.type, "text": message.text}
            ),
        )
        desktop.on(
            "pageerror",
            lambda error: browser_messages.append(
                {"kind": "pageerror", "level": "error", "text": str(error)}
            ),
        )
        desktop.on(
            "response",
            lambda response: browser_messages.append(
                {
                    "kind": "response",
                    "level": "error",
                    "text": f"HTTP {response.status} {response.url}",
                }
            )
            if response.status >= 400
            else None,
        )
        capture(desktop, args.base_url, "/", output, "landing-desktop")
        capture(
            desktop,
            args.base_url,
            "/studio?start=draw",
            output,
            "schematic-desktop",
        )
        capture(desktop, args.base_url, "/building/demo", output, "demo-workspace-desktop")
        capture_diagnosis(desktop, args.base_url, output, "desktop")
        desktop.close()

        mobile = browser.new_page(viewport={"width": 390, "height": 844})
        mobile.add_init_script(
            f"""
            localStorage.setItem({json.dumps(APP_STORAGE_KEY)}, JSON.stringify({{
              state: {{ language: 'en', sidePanelOpen: true, hasSeenTour: true,
                hasSeenHomeTour: true, hasSeenTwinTour: true }},
              version: 1
            }}))
            """
        )
        mobile.on(
            "console",
            lambda message: browser_messages.append(
                {"kind": "console", "level": message.type, "text": message.text}
            ),
        )
        mobile.on(
            "pageerror",
            lambda error: browser_messages.append(
                {"kind": "pageerror", "level": "error", "text": str(error)}
            ),
        )
        mobile.on(
            "response",
            lambda response: browser_messages.append(
                {
                    "kind": "response",
                    "level": "error",
                    "text": f"HTTP {response.status} {response.url}",
                }
            )
            if response.status >= 400
            else None,
        )
        capture(mobile, args.base_url, "/building/demo", output, "demo-workspace-mobile")
        capture_diagnosis(mobile, args.base_url, output, "mobile")
        mobile.close()
        browser.close()

    expected_optional = [
        message
        for message in browser_messages
        if message["kind"] == "response"
        and message["text"].startswith("HTTP 503 ")
        and "/api/vworld/footprint?contextMode=true" in message["text"]
    ]
    expected_resource_console_count = len(expected_optional)
    actionable: list[dict[str, str]] = []
    for message in browser_messages:
        if message in expected_optional:
            continue
        if (
            expected_resource_console_count > 0
            and message["kind"] == "console"
            and message["level"] == "error"
            and message["text"].startswith("Failed to load resource:")
            and "503 (Service Unavailable)" in message["text"]
        ):
            expected_resource_console_count -= 1
            continue
        if message["kind"] == "pageerror" or message["level"] == "error":
            actionable.append(message)
    print(
        json.dumps(
            {
                "browserErrors": actionable,
                "expectedUnavailableResponses": expected_optional,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
