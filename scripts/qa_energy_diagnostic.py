"""Capture browser-level BIMFIT energy-diagnostic runtime evidence.

The script is intentionally independent of the Playwright test runner so it can
be used against any already-running local or preview deployment:

    python scripts/qa_energy_diagnostic.py --base-url http://127.0.0.1:3000
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright


APP_STORAGE_KEY = "korea-building-info-storage"
RECOVERY_DXF = "\n".join(
    [
        "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6",
        "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", "0", "LWPOLYLINE",
        "8", "BIM_OUTLINE", "90", "4", "70", "1", "10", "0", "20", "0",
        "10", "20", "20", "0", "10", "20", "20", "20", "10", "0", "20", "20",
        "0", "ENDSEC", "0", "EOF", "",
    ]
)


def seed_english_session(context: BrowserContext) -> None:
    script = """
        (() => {
          const storageKey = __STORAGE_KEY__;
          localStorage.setItem(storageKey, JSON.stringify({
            state: {
              apiKey: "",
              language: "en",
              sidePanelOpen: true,
              hasSeenTour: true,
              hasSeenHomeTour: true,
              hasSeenTwinTour: true
            },
            version: 1
          }));
        })()
        """.replace("__STORAGE_KEY__", json.dumps(APP_STORAGE_KEY))
    context.add_init_script(script)


def attach_runtime_observers(page: Page, runtime: dict[str, list[Any]]) -> None:
    page.on(
        "console",
        lambda message: runtime["console"].append(
            {"type": message.type, "text": message.text}
        )
        if message.type in {"warning", "error"}
        else None,
    )
    page.on("pageerror", lambda error: runtime["pageErrors"].append(str(error)))
    page.on(
        "requestfailed",
        lambda request: runtime["requestFailures"].append(
            {
                "method": request.method,
                "url": request.url,
                "failure": request.failure,
            }
        ),
    )
    page.on(
        "response",
        lambda response: runtime["httpErrors"].append(
            {"status": response.status, "url": response.url}
        )
        if response.status >= 400
        else None,
    )


def visible_controls(page: Page) -> list[dict[str, str | None]]:
    return page.locator("a, button, input, [role=tab]").evaluate_all(
        """
        elements => elements
          .filter(element => {
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none'
              && box.width > 0 && box.height > 0;
          })
          .map(element => ({
            tag: element.tagName.toLowerCase(),
            text: (element.innerText || element.getAttribute('aria-label') || '').trim(),
            href: element.getAttribute('href'),
            testId: element.getAttribute('data-testid'),
            pressed: element.getAttribute('aria-pressed'),
            disabled: element.hasAttribute('disabled') ? 'true' : null
          }))
        """
    )


def capture(page: Page, output: Path, name: str, evidence: dict[str, Any]) -> None:
    page.wait_for_load_state("networkidle")
    page.screenshot(path=str(output / f"{name}.png"), full_page=True)
    evidence["screens"][name] = {
        "url": page.url,
        "title": page.title(),
        "headings": [
            value.strip()
            for value in page.locator("h1, h2, h3").all_inner_texts()
            if value.strip()
        ],
        "controls": visible_controls(page),
        "layout": page.locator("html").evaluate(
            "element => ({clientWidth: element.clientWidth, scrollWidth: element.scrollWidth})"
        ),
    }


def complete_sample_diagnostic(page: Page, base_url: str) -> None:
    page.goto(f"{base_url}/diagnostics/new?method=sample")
    page.get_by_test_id("stage-panel-review").wait_for(state="visible")

    confirm = page.get_by_role("button", name="Confirm selected value", exact=True)
    if confirm.count() and confirm.is_visible():
        confirm.click()

    next_action = page.get_by_test_id("next-diagnosis-action")
    next_action.filter(has_text="Apply 0.5 ACH assumption").wait_for(
        state="visible"
    )
    next_action.click()
    next_action.filter(has_text="Run baseline simulation").wait_for(state="visible")
    next_action.click()
    page.get_by_test_id("result-comparison").wait_for(state="visible")
    page.get_by_test_id("energy-diagnosis-scene").wait_for(state="visible")


def select_first_finding(page: Page) -> None:
    finding = (
        page.get_by_test_id("diagnostic-findings")
        .locator("button[aria-pressed]")
        .first
    )
    finding.wait_for(state="visible")
    finding.click()
    page.locator('[data-selected="true"]').first.wait_for(state="visible")


def exercise_desktop(
    browser: Browser, base_url: str, output: Path, evidence: dict[str, Any]
) -> None:
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    seed_english_session(context)
    page = context.new_page()
    attach_runtime_observers(page, evidence["runtime"])

    page.goto(f"{base_url}/")
    capture(page, output, "01-landing-desktop", evidence)

    page.get_by_test_id("landing-new-diagnostic").click()
    page.get_by_test_id("diagnostic-start").wait_for(state="visible")
    capture(page, output, "02-diagnostic-start-desktop", evidence)

    complete_sample_diagnostic(page, base_url)
    capture(page, output, "03-sample-results-desktop", evidence)
    select_first_finding(page)
    capture(page, output, "04-finding-selected-desktop", evidence)
    evidence["sampleResult"] = page.get_by_test_id("result-comparison").inner_text()
    evidence["scene"] = page.get_by_test_id("energy-diagnosis-scene").evaluate(
        "element => { const canvas = element.querySelector('canvas'); const box = element.getBoundingClientRect(); const canvasBox = canvas?.getBoundingClientRect(); return { width: box.width, height: box.height, canvasWidth: canvasBox?.width ?? 0, canvasHeight: canvasBox?.height ?? 0 }; }"
    )

    page.get_by_test_id("toggle-improvement-editor").click()
    alternative_cop = page.get_by_role("spinbutton", name="Alternative heating COP")
    alternative_cop.fill("0")
    page.get_by_test_id("run-improvement-scenario").click()
    page.wait_for_function(
        "document.querySelector('[data-testid=diagnosis-feedback]')?.textContent?.includes('must be positive')"
    )
    capture(page, output, "04a-alternative-failure-preserves-results", evidence)
    failure_message = page.get_by_test_id("diagnosis-feedback").inner_text()
    alternative_cop.fill("")
    page.get_by_test_id("scenario-window-u-value").fill("1.3")
    page.get_by_test_id("run-improvement-scenario").click()
    page.get_by_test_id("result-comparison").filter(
        has_text="Improvement alternative"
    ).wait_for(state="visible")
    capture(page, output, "04b-alternative-retry-results", evidence)
    evidence["simulationRecovery"] = {
        "failureMessage": failure_message,
        "baselinePreserved": "Baseline"
        in page.get_by_test_id("result-comparison").inner_text(),
        "retrySucceeded": "Improvement alternative"
        in page.get_by_test_id("result-comparison").inner_text(),
    }

    page.wait_for_function("location.search.includes('project=')", timeout=15_000)
    saved_url = page.url
    page.reload()
    page.get_by_test_id("result-comparison").wait_for(state="visible")
    capture(page, output, "05-sample-restored-desktop", evidence)
    evidence["persistence"] = {
        "savedUrl": saved_url,
        "restoredUrl": page.url,
        "resultRestored": "real engine result"
        in page.get_by_test_id("result-comparison").inner_text().lower(),
    }

    page.goto(f"{base_url}/diagnostics/new?method=create")
    editor = page.get_by_role("application", name="Schematic drawing canvas")
    editor.wait_for(state="visible")
    capture(page, output, "06-create-geometry-desktop", evidence)
    page.get_by_test_id("schematic-tool-boundary").click()
    box = editor.bounding_box()
    if box is None:
        raise RuntimeError("The schematic canvas has no measurable bounds.")
    page.mouse.move(box["x"] + box["width"] * 0.22, box["y"] + box["height"] * 0.25)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] * 0.72, box["y"] + box["height"] * 0.70)
    page.mouse.up()
    page.get_by_role("button", name="Review building model").click()
    page.get_by_test_id("tier-one-assumption-card").wait_for(state="visible")
    page.get_by_test_id("accept-tier-one-assumptions").click()
    page.get_by_test_id("next-diagnosis-action").filter(
        has_text="Run baseline simulation"
    ).wait_for(state="visible")
    page.get_by_test_id("next-diagnosis-action").click()
    page.get_by_test_id("result-comparison").wait_for(state="visible")
    capture(page, output, "07-created-building-results-desktop", evidence)

    page.goto(f"{base_url}/diagnostics/new?method=upload")
    page.get_by_test_id("drawing-set-input").set_input_files(
        {
            "name": "broken-floor-plan.dxf",
            "mimeType": "application/dxf",
            "buffer": b"THIS IS NOT A DXF",
        }
    )
    page.get_by_test_id("diagnosis-feedback").wait_for(state="visible")
    capture(page, output, "08-malformed-dxf-recovery-desktop", evidence)
    rejected_message = page.get_by_test_id("diagnosis-feedback").inner_text()

    page.get_by_test_id("drawing-set-input").set_input_files(
        {
            "name": "recovered-floor-plan.dxf",
            "mimeType": "application/dxf",
            "buffer": RECOVERY_DXF.encode("utf-8"),
        }
    )
    page.get_by_test_id("tier-one-assumption-card").wait_for(state="visible")
    page.get_by_test_id("accept-tier-one-assumptions").click()
    page.get_by_test_id("next-diagnosis-action").filter(
        has_text="Run baseline simulation"
    ).wait_for(state="visible")
    page.get_by_test_id("next-diagnosis-action").click()
    page.get_by_test_id("result-comparison").wait_for(state="visible")
    capture(page, output, "09-malformed-dxf-recovered-results-desktop", evidence)
    evidence["drawingRecovery"] = {
        "rejectedMessage": rejected_message,
        "workRecovered": True,
        "result": page.get_by_test_id("result-comparison").inner_text(),
    }

    context.close()


def exercise_mobile(
    browser: Browser, base_url: str, output: Path, evidence: dict[str, Any]
) -> None:
    context = browser.new_context(
        viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True
    )
    seed_english_session(context)
    page = context.new_page()
    attach_runtime_observers(page, evidence["runtime"])

    page.goto(f"{base_url}/")
    capture(page, output, "10-landing-mobile", evidence)

    page.goto(f"{base_url}/diagnostics/new")
    page.get_by_test_id("diagnostic-start").wait_for(state="visible")
    capture(page, output, "11-diagnostic-start-mobile", evidence)

    complete_sample_diagnostic(page, base_url)
    select_first_finding(page)
    capture(page, output, "12-finding-selected-mobile", evidence)
    page.get_by_test_id("results-at-a-glance").screenshot(
        path=str(output / "12a-results-summary-mobile.png")
    )
    page.get_by_test_id("energy-diagnosis-scene").screenshot(
        path=str(output / "12b-spatial-result-mobile.png")
    )

    context.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    parser.add_argument(
        "--output", default="qa-evidence/energy-diagnostic-mission-final"
    )
    args = parser.parse_args()

    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    evidence: dict[str, Any] = {
        "baseUrl": args.base_url.rstrip("/"),
        "screens": {},
        "runtime": {
            "console": [],
            "pageErrors": [],
            "requestFailures": [],
            "httpErrors": [],
        },
    }

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        exercise_desktop(browser, evidence["baseUrl"], output, evidence)
        exercise_mobile(browser, evidence["baseUrl"], output, evidence)
        browser.close()

    (output / "runtime-evidence.json").write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    # Keep stdout portable on Windows consoles while the evidence file retains
    # readable UTF-8 labels.
    print(json.dumps(evidence, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
