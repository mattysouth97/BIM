from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright


def image_delta(left: bytes, right: bytes) -> float:
    a = Image.open(io.BytesIO(left)).convert("RGB")
    b = Image.open(io.BytesIO(right)).convert("RGB")
    diff = ImageChops.difference(a, b)
    return sum(ImageStat.Stat(diff).mean) / 3


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:3141")
    parser.add_argument("--output", default="qa-evidence/spatial-focus")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    evidence: dict[str, object] = {
        "baseUrl": base_url,
        "pageErrors": [],
        "consoleErrors": [],
        "requestFailures": [],
    }
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda error: evidence["pageErrors"].append(str(error)))
        page.on(
            "console",
            lambda message: evidence["consoleErrors"].append(message.text)
            if message.type == "error"
            else None,
        )
        page.on(
            "requestfailed",
            lambda request: evidence["requestFailures"].append(
                f"{request.method} {request.url}: {request.failure}"
            ),
        )
        page.add_init_script(
            """
            localStorage.setItem('korea-building-info-storage', JSON.stringify({
              state: {
                apiKey: '', language: 'en', sidePanelOpen: true,
                hasSeenTour: true, hasSeenHomeTour: true, hasSeenTwinTour: true
              },
              version: 1
            }));
            """
        )
        page.goto(f"{base_url}/diagnostics/new?method=sample")
        page.wait_for_load_state("networkidle")
        page.get_by_test_id("stage-panel-review").wait_for(timeout=20_000)
        page.get_by_role("button", name="Confirm selected value", exact=True).click()
        page.get_by_text("User selection recorded.").wait_for()
        page.get_by_test_id("diagnosis-stage-model").click()
        next_action = page.get_by_test_id("next-diagnosis-action")
        next_action.filter(has_text="Apply 0.5 ACH assumption").wait_for()
        next_action.click()
        page.get_by_test_id("diagnosis-stage-preflight").click()
        next_action.filter(has_text="Run baseline simulation").wait_for()
        next_action.click()
        page.get_by_test_id("stage-panel-compare").wait_for(timeout=20_000)

        finding = page.get_by_test_id(
            "finding-finding:dominant-envelope:windows"
        )
        if finding.count() == 0:
            finding = page.locator('[data-testid^="finding-finding:dominant-envelope:"]').first
        finding.wait_for()
        title = " ".join(
            finding.locator('p[id$="-title"]').inner_text().split()
        )
        scene = page.get_by_test_id("energy-diagnosis-scene")
        canvas = scene.locator("canvas")
        canvas.wait_for()
        before = canvas.screenshot(path=output / "01-before-selection.png")

        finding_button = finding.get_by_role("button", name=title, exact=True)
        finding_button.focus()
        page.keyboard.press("Enter")
        page.get_by_test_id("diagnostic-spatial-selection-status").wait_for()
        page.wait_for_timeout(900)
        focused = canvas.screenshot(path=output / "02-focused-selection.png")
        page.screenshot(path=output / "03-focused-page.png", full_page=False)

        box = canvas.bounding_box()
        if box is None:
            raise RuntimeError("diagnostic canvas has no bounding box")
        page.mouse.move(box["x"] + box["width"] * 0.52, box["y"] + box["height"] * 0.5)
        page.mouse.down()
        page.mouse.move(
            box["x"] + box["width"] * 0.68,
            box["y"] + box["height"] * 0.56,
            steps=12,
        )
        page.mouse.up()
        page.wait_for_timeout(500)
        manual = canvas.screenshot(path=output / "04-manual-orbit.png")

        finding.get_by_role("button", name=title, exact=True).click()
        page.wait_for_timeout(900)
        refocused = canvas.screenshot(path=output / "05-refocused-selection.png")

        evidence.update(
            {
                "findingTitle": title,
                "activation": "keyboard Enter",
                "ariaPressed": finding_button.get_attribute("aria-pressed"),
                "precision": scene.get_attribute("data-focus-precision"),
                "highlightedObjectCount": scene.get_attribute(
                    "data-highlighted-object-count"
                ),
                "status": page.get_by_test_id(
                    "diagnostic-spatial-selection-status"
                ).inner_text(),
                "selectionKind": scene.get_attribute("data-selection-kind"),
                "canvas": {
                    "width": round(box["width"]),
                    "height": round(box["height"]),
                },
                "hashes": {
                    "before": hashlib.sha256(before).hexdigest(),
                    "focused": hashlib.sha256(focused).hexdigest(),
                    "manual": hashlib.sha256(manual).hexdigest(),
                    "refocused": hashlib.sha256(refocused).hexdigest(),
                },
                "pixelDelta": {
                    "beforeToFocused": round(image_delta(before, focused), 3),
                    "focusedToManual": round(image_delta(focused, manual), 3),
                    "focusedToRefocused": round(image_delta(focused, refocused), 3),
                },
            }
        )
        browser.close()
    (output / "runtime-evidence.json").write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(evidence, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
