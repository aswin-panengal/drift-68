"""Install a release VSIX and exercise it in a disposable VS Code workbench."""

import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen
from zipfile import ZipFile

import psutil
from playwright.sync_api import Error, TimeoutError as PlaywrightTimeout, expect, sync_playwright


REQUIRED_FILES = {
    "[Content_Types].xml", "extension.vsixmanifest",
    "extension/package.json", "extension/readme.md", "extension/LICENSE.txt",
    "extension/THIRD_PARTY_NOTICES.md", "extension/media/icon.png", "extension/media/drift.svg",
    "extension/dist/extension.cjs", "extension/dist/webview/index.html",
    "extension/dist/webview/game.js", "extension/dist/webview/index.css",
    "extension/dist/webview/Outfit.woff2", "extension/dist/webview/OFL-Outfit.txt",
    "extension/dist/webview/drift-cover.webp", "extension/dist/webview/drift-cover-portrait.webp",
}

REPLAY_GAMEPAD = """(inputs) => {
    let step = 0;
    const buttons = Array.from({ length: 17 }, () => ({ value: 0, pressed: false }));
    const pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons };
    Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => {
            const input = inputs[step++];
            if (!input) return [];
            pad.axes[0] = -input.steer;
            buttons[0].pressed = input.handbrake;
            buttons[1].pressed = input.boost;
            buttons[6].value = input.brake;
            buttons[7].value = input.throttle;
            return [pad];
        },
    });
}"""


def verify_archive(vsix):
    with ZipFile(vsix) as package:
        names = package.namelist()
        entries = set(names)
        assert len(names) == len(entries), "The VSIX contains duplicate entries"
        assert not REQUIRED_FILES - entries, f"Missing VSIX files: {REQUIRED_FILES - entries}"
        unexpected = {
            name for name in entries - REQUIRED_FILES
            if not re.fullmatch(r"extension/docs/(?:[A-Z_]+\.md|screenshots/[a-z-]+\.png)", name)
        }
        assert not unexpected, f"Unexpected files in VSIX: {unexpected}"
        manifest = json.loads(package.read("extension/package.json"))
        assert manifest["main"] == "./dist/extension.cjs"
        assert b"__drift" not in package.read("extension/dist/webview/game.js")
    return manifest


def devtools_endpoint(profile, process):
    port_file = profile / "DevToolsActivePort"
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"VS Code exited during startup ({process.returncode})")
        try:
            port = int(port_file.read_text(encoding="utf-8").splitlines()[0])
            endpoint = f"http://127.0.0.1:{port}"
            with urlopen(f"{endpoint}/json/version", timeout=1):
                return endpoint
        except (OSError, IndexError, ValueError, URLError):
            time.sleep(.2)
    raise TimeoutError("The disposable VS Code window did not expose its DevTools port")


def workbench_page(context):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        for page in context.pages:
            if "workbench" in page.url:
                page.wait_for_load_state("domcontentloaded")
                page.locator(".monaco-workbench .part.statusbar").wait_for(state="visible")
                return page
        time.sleep(.2)
    raise TimeoutError("VS Code workbench did not open")


def stop_process_tree(process):
    try:
        parent = psutil.Process(process.pid)
        children = parent.children(recursive=True)
    except psutil.NoSuchProcess:
        return
    for item in [parent, *children]:
        try:
            item.terminate()
        except psutil.NoSuchProcess:
            pass
    _, remaining = psutil.wait_procs([parent, *children], timeout=5)
    for item in remaining:
        try:
            item.kill()
        except psutil.NoSuchProcess:
            pass


class Workbench:
    def __init__(self, page, output, report):
        self.page = page
        self.output = output
        self.report = report
        self.modifier = "Meta" if sys.platform == "darwin" else "Control"

    def passed(self, check):
        self.report["passed"].append(check)
        print(f"PASS: {check}", flush=True)

    def command(self, name):
        self.page.bring_to_front()
        self.page.locator(".monaco-workbench .part.statusbar").wait_for(state="visible")
        palette = self.page.locator(".quick-input-widget input").first
        for attempt in range(3):
            if not palette.is_visible():
                self.page.keyboard.press("F1")
            try:
                palette.wait_for(state="visible", timeout=3_000)
                break
            except PlaywrightTimeout:
                if attempt == 2:
                    raise
        palette.fill(">" + name)
        exact_label = re.compile(r"^" + re.escape(name) + r"$")
        self.page.locator(".quick-input-list .monaco-list-row").filter(
            has=self.page.get_by_text(exact_label)
        ).first.click()

    def game(self, mode="editor", screen=None):
        selector = f'#game-root[data-mode="{mode}"]'
        if screen:
            selector += f'[data-screen="{screen}"]'
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            for frame in self.page.frames:
                try:
                    if frame.locator(selector).is_visible():
                        return frame
                except Error:
                    continue
            self.page.wait_for_timeout(100)
        raise AssertionError(f"No visible {mode} game with screen {screen!r}")

    def open_sidebar(self, screen="pause"):
        game = self.game("sidebar")
        if game.locator('[data-screen="idle"]').is_visible():
            expect(game.locator("canvas")).to_have_count(0)
            button(game, "Play").click()
        elif screen == "modes" and game.locator('[data-screen="title"]').is_visible():
            button(game, "Play").click()
        return self.game("sidebar", screen)

    def assert_one_canvas(self):
        count = 0
        for frame in self.page.frames:
            try:
                count += frame.locator("#scene canvas").count()
            except Error:
                continue
        assert count == 1, f"Expected one game canvas, got {count}"

    def back_to_title(self, game):
        button(game, "Back").click()
        expect(game.locator('[data-screen="modes"]')).to_be_visible()
        button(game, "Back").click()
        expect(game.locator('[data-screen="title"]')).to_be_visible()

    def open_setup_from_title(self, game):
        button(game, "Play").click()
        button(game, "Solo").click()

    def pick_setup(self, game, key, value):
        selection = game.locator(f"[data-selection={key}]")
        label = "car" if key == "car" else "circuit"
        for _ in range(4):
            if selection.get_attribute("data-selected") == value:
                break
            button(game, f"Next {label}").click()
        expect(selection).to_have_attribute("data-selected", value)

    def verify(self, replay):
        self.command("Drift 68: Open in Explorer")
        sidebar = self.open_sidebar("modes")
        button(sidebar, "Solo").click()
        self.pick_setup(sidebar, "car", replay["car"])
        self.pick_setup(sidebar, "track", replay["track"])
        self.back_to_title(sidebar)
        self.verify_title_cover(sidebar)
        self.page.screenshot(path=str(self.output / "sidebar-title.png"), animations="disabled")
        self.passed("The default Explorer height allows opening the game and selecting a car and circuit")

        self.command("Drift 68: Open in Editor")
        game = self.game(screen="title")
        self.verify_title_cover(game)
        self.page.screenshot(path=str(self.output / "editor-title.png"), animations="disabled")
        assert game.evaluate('async () => (await document.fonts.load("400 20px Outfit")).some(font => font.status === "loaded")')
        assert "default-src 'none'" in game.locator('meta[http-equiv="Content-Security-Policy"]').get_attribute("content")
        self.passed("Installed Explorer and editor titles load local artwork without WebGL")

        button(game, "Play").click()
        expect(game.locator("#scene canvas")).to_have_count(0)
        button(game, "Solo").click()
        self.pick_setup(game, "car", replay["car"])
        self.pick_setup(game, "track", replay["track"])
        button(game, "Head to the start").click()
        expect(game.locator("#focus-hint")).to_be_visible()
        game.locator("#scene").click()
        for _ in range(3):
            self.page.keyboard.press("v")
        expect(game.get_by_role("status")).to_have_text("Rear chase camera")
        self.page.keyboard.press("n")
        expect(game.locator(".minimap")).to_be_hidden()
        self.page.keyboard.press("n")
        self.page.keyboard.press("h")
        expect(game.locator("#lap-time")).to_be_hidden()
        self.page.keyboard.press("h")
        self.page.keyboard.press("m")
        expect(game.get_by_role("status")).to_have_text("Sound on")
        self.page.keyboard.press("m")
        expect(game.get_by_role("status")).to_have_text("Sound off")
        self.page.keyboard.down("w")
        expect(game.locator("#speed")).to_have_text(re.compile(r"^[1-9]\d+$"), timeout=20_000)
        self.page.keyboard.up("w")
        self.page.screenshot(path=str(self.output / "editor-drive.png"))
        self.passed("Focused workbench dispatches camera and acceleration keys")

        self.page.keyboard.press(f"{self.modifier}+n")
        source = "wasd r v m n h stay in the source editor"
        self.page.wait_for_function("document.activeElement?.closest('.monaco-editor') !== null")
        self.page.keyboard.type(source, delay=15)
        lines = self.page.locator(".editor-instance .view-lines").last
        expect(lines).to_contain_text(source.replace(" ", "\u00a0"))
        self.page.keyboard.press(f"{self.modifier}+z")
        expect(lines).not_to_contain_text(source.replace(" ", "\u00a0"))
        self.command("Drift 68: Open in Editor")
        game = self.game(screen="pause")
        shortcuts = game.locator(".pause-shortcuts")
        shortcuts.get_by_text("Keyboard shortcuts", exact=True).click()
        expect(shortcuts.locator("dd")).to_have_count(12)
        shortcuts.get_by_text("Keyboard shortcuts", exact=True).click()
        speed = game.locator("#speed").inner_text()
        self.page.keyboard.type("wwww")
        expect(game.locator("#speed")).to_have_text(speed)
        self.passed("Code typing and undo work while the game is hidden and returns paused")

        button(game, "Maximize editor").click()
        game = self.game("maximized", "pause")
        button(game, "Restore editor").click()
        game = self.game(screen="pause")
        button(game, "Return to Explorer").click()
        sidebar = self.open_sidebar()
        button(sidebar, "Settings").click()
        expect(sidebar.get_by_label("Camera", exact=True)).to_have_value("3")
        sidebar.get_by_label("Graphics quality", exact=True).select_option("low")
        button(sidebar, "Back").click()
        self.assert_one_canvas()
        self.page.screenshot(path=str(self.output / "sidebar.png"))
        for _ in range(3):
            button(sidebar, "Open in editor").click()
            game = self.game(screen="pause")
            self.assert_one_canvas()
            button(game, "Return to Explorer").click()
            sidebar = self.open_sidebar()
            self.assert_one_canvas()
        button(sidebar, "Open in editor").click()
        game = self.game(screen="pause")
        self.passed("Maximize and restore work; repeated view transfers preserve settings and one canvas")

        button(game, "Restart Lap").click()
        expect(game.locator("#progress")).to_have_text("Checkpoint 0 / 12")
        game.evaluate(REPLAY_GAMEPAD, replay["input"])
        game.locator("#scene").click()
        expect(game.locator("#progress")).to_have_text(re.compile(r"Checkpoint [1-9] / 12"), timeout=35_000)
        game.locator('[data-screen="results"]').wait_for(timeout=240_000)
        expect(game.get_by_text("A new personal best", exact=True)).to_be_visible()
        expect(game.locator(".final-score strong")).to_have_text(f'{replay["score"]:,}')
        minutes, seconds = divmod(replay["time"], 60)
        expect(game.locator(".results-stats dd").last).to_have_text(f"{int(minutes)}:{seconds:04.1f}")
        self.report["lap"] = {key: replay[key] for key in ("track", "car", "time", "score")}
        self.page.screenshot(path=str(self.output / "lap-results.png"))
        self.passed("A continuous lap through the standard gamepad input path reaches real results")

        button(game, "Change car or circuit").click()
        expect(game.locator("[data-selection=track]")).to_contain_text("Best")
        with self.page.expect_event("framenavigated", predicate=lambda frame: frame == self.page.main_frame):
            self.command("Developer: Reload Window")
        self.page.wait_for_load_state("domcontentloaded")
        self.command("Drift 68: Open in Editor")
        game = self.game(screen="garage")
        track = game.locator("[data-selection=track]")
        expect(track).to_contain_text(f'Best {replay["score"]:,} pts')
        self.back_to_title(game)
        button(game, "Settings").click()
        expect(game.get_by_label("Graphics quality", exact=True)).to_have_value("low")
        expect(game.get_by_label("Camera", exact=True)).to_have_value("3")
        self.passed("Saved lap and settings survive a full workbench reload")

        button(game, "Reset local records").click()
        self.page.get_by_role("dialog").get_by_role("button", name="Cancel", exact=True).click()
        button(game, "Back").click()
        self.open_setup_from_title(game)
        expect(track).to_contain_text("Best")
        self.back_to_title(game)
        button(game, "Settings").click()
        button(game, "Reset local records").click()
        self.page.get_by_role("dialog").get_by_role("button", name="Reset records", exact=True).click()
        button(game, "Back").click()
        self.open_setup_from_title(game)
        expect(track).not_to_contain_text("Best")
        self.passed("Cancel preserves records and explicit confirmation clears them")

    def verify_title_cover(self, game):
        expect(game.get_by_role("heading", name="Drift 68")).to_be_visible()
        expect(game.locator("#scene canvas")).to_have_count(0)
        assert game.locator("#scene").evaluate(r"""async scene => {
            const source = getComputedStyle(scene).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
            if (!source) return false;
            const image = new Image();
            image.src = source[1];
            await image.decode();
            return image.naturalWidth > 0;
        }""")


def button(game, name):
    return game.get_by_role("button", name=name, exact=True)


def main(executable, cli, output, vsix):
    manifest = verify_archive(vsix)
    profile = output / "profile"
    extensions = output / "extensions"
    identity = f'{manifest["publisher"]}.{manifest["name"]}'
    profile_args = [f"--user-data-dir={profile}", f"--extensions-dir={extensions}"]
    subprocess.run([cli, *profile_args, "--install-extension", str(vsix)], check=True, timeout=90)
    listing = subprocess.check_output(
        [cli, *profile_args, "--list-extensions", "--show-versions"], text=True, timeout=30,
    )
    assert listing.strip() == f'{identity}@{manifest["version"]}', listing
    version = subprocess.check_output([cli, "--version"], text=True, timeout=30).splitlines()[0]
    report = {
        "vscode": version,
        "extension": listing.strip(),
        "vsixSha256": hashlib.sha256(vsix.read_bytes()).hexdigest(),
        "passed": ["VSIX contents and installation verified"],
    }
    replay = json.loads((output / "lap-replay.json").read_text(encoding="utf-8"))
    room_server = os.getenv("DRIFT_MULTIPLAYER_TEST_URL")
    if room_server == "default":
        key = "driftBreak.multiplayer.serverUrl"
        settings = json.loads((profile / "User" / "settings.json").read_text(encoding="utf-8"))
        assert key not in settings
        room_server = manifest["contributes"]["configuration"]["properties"][key]["default"]
        assert room_server.startswith("wss://"), "The VSIX must include a secure room server default"
        report["passed"].append("Packaged server default tested with no user override")
    profile_flags = ["--enable-precise-memory-info", "--js-flags=--expose-gc"] if room_server else []
    if room_server and os.getenv("DRIFT_MULTIPLAYER_TEST_LOCAL_TLS") == "1":
        assert re.fullmatch(r"wss://(?:127\.0\.0\.1|localhost):\d+", room_server)
        profile_flags.append("--ignore-certificate-errors")

    with (output / "workbench.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen([
            executable, str(output / "workspace"), *profile_args, "--new-window", "--skip-welcome",
            "--skip-release-notes", "--disable-workspace-trust", "--locale=en-US", "--remote-debugging-port=0", *profile_flags,
        ], stdout=log, stderr=log)
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.connect_over_cdp(devtools_endpoint(profile, process))
                page = workbench_page(browser.contexts[0])
                page.bring_to_front()
                try:
                    workbench = Workbench(page, output, report)
                    if room_server:
                        from multiplayer_workbench import verify_multiplayer
                        verify_multiplayer(workbench, room_server)
                    else:
                        workbench.verify(replay)
                except Exception:
                    try:
                        page.screenshot(path=str(output / "failure.png"), timeout=10_000)
                    except Error:
                        pass
                    raise
                finally:
                    browser.close()
        finally:
            stop_process_tree(process)
            (output / "workbench-results.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], Path(sys.argv[3]), Path(sys.argv[4]))
