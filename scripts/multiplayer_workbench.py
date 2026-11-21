"""Exercise and profile Multiplayer in the installed VS Code webviews."""

import json
import math
import os
import re
import secrets
import ssl
import struct
import threading
import time
import uuid

from playwright.sync_api import expect
from websockets.exceptions import ConnectionClosed, InvalidMessage
from websockets.sync.client import connect


def button(game, name):
    return game.get_by_role("button", name=name, exact=True)


def room_code():
    return "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(8))


def socket(origin, code, action, token, car="solace", rules=""):
    tls = ssl.create_default_context()
    local_tls = os.getenv("DRIFT_MULTIPLAYER_TEST_LOCAL_TLS") == "1"
    if local_tls:
        tls.check_hostname = False
        tls.verify_mode = ssl.CERT_NONE
    uri = f"{origin}/v1/rooms/{code}"
    protocols = ["drift-break-v1", f"{action}.{token}.{car}{rules}"]
    if not local_tls:
        return connect(uri, ssl=tls, open_timeout=10, subprotocols=protocols)

    # Wrangler's Windows loopback proxy can close before returning the upgrade.
    # Retry the test peer transport only, without retrying room close codes.
    for attempt in range(3):
        try:
            return connect(uri, ssl=tls, open_timeout=5, subprotocols=protocols)
        except (InvalidMessage, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(.2)


def view(peer, accepts):
    deadline = time.monotonic() + 7
    while time.monotonic() < deadline:
        event = peer.recv(timeout=max(.01, deadline - time.monotonic()))
        if isinstance(event, str):
            state = json.loads(event)
            if accepts(state):
                return state
    raise AssertionError("Expected room state did not arrive")


class LiveOpponent:
    def __init__(self, peer):
        self.peer = peer
        self.packets = 0
        self.sent = 0
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self.relay, daemon=True)

    def relay(self):
        last_sent = 0
        while not self.stop.is_set():
            try:
                event = self.peer.recv(timeout=.1)
            except TimeoutError:
                continue
            except ConnectionClosed:
                return
            if not isinstance(event, bytes):
                continue
            assert len(event) == 20
            self.packets += 1
            x, z, heading, vx, vz = struct.unpack("<5f", event)
            now = time.monotonic()
            if now >= last_sent + .095:
                self.peer.send(struct.pack("<5f", x + 3 * math.cos(heading) + math.sin(now), z - 3 * math.sin(heading),
                                           heading, vx + math.cos(now), vz))
                self.sent += 1
                last_sent = now

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.stop.set()
        self.thread.join(timeout=2)
        assert not self.thread.is_alive()


def profile(workbench, game):
    game.evaluate("""() => {
        const gl = document.querySelector('#scene canvas').getContext('webgl2');
        if (!gl || gl.driftProfile) return;
        const counts = { frames: 0, draws: 0 };
        const clear = gl.clear.bind(gl);
        gl.clear = mask => {
            if (mask & gl.COLOR_BUFFER_BIT) counts.frames++;
            return clear(mask);
        };
        // Three.js uses these for the cars and for the instanced track scenery.
        for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
            const draw = gl[name].bind(gl);
            gl[name] = (...args) => { counts.draws++; return draw(...args); };
        }
        gl.driftProfile = counts;
    }""")
    workbench.page.wait_for_timeout(1500)
    snapshot = """() => {
        window.gc?.();
        const canvas = document.querySelector('#scene canvas');
        const { frames, draws } = canvas.getContext('webgl2').driftProfile;
        return { frames, draws, now: performance.now(), heap: performance.memory?.usedJSHeapSize,
                 resolution: [canvas.width, canvas.height] };
    }"""
    start = game.evaluate(snapshot)
    workbench.page.wait_for_timeout(4000)
    end = game.evaluate(snapshot)
    frames = end["frames"] - start["frames"]
    assert frames > 0
    return {
        "fps": round(frames * 1000 / (end["now"] - start["now"]), 2),
        "drawsPerFrame": round((end["draws"] - start["draws"]) / frames, 1),
        "heapMiB": round(end["heap"] / 2**20, 2),
        "resolution": end["resolution"],
    }


def verify_room_cleanup(origin):
    code, host_token = room_code(), uuid.uuid4()
    expect_close(origin, code, "join", uuid.uuid4(), 4404)
    with socket(origin, code, "create", host_token, rules=".coastal.1") as host:
        view(host, lambda state: state["phase"] == "lobby")
        expect_close(origin, code, "resume", uuid.uuid4(), 4410)
        with socket(origin, code, "join", uuid.uuid4()) as guest:
            view(guest, lambda state: state["slot"] == 1)
            view(host, lambda state: state["peer"] and state["peer"]["online"])
        view(host, lambda state: state["peer"] and not state["peer"]["online"])
        assert json.loads(host.recv(timeout=35))["peer"] is None
        with socket(origin, code, "join", uuid.uuid4()) as guest:
            view(guest, lambda state: state["slot"] == 1)
            host.send("leave")
            try:
                assert guest.recv(timeout=5) == "closed"
            except ConnectionClosed as error:
                assert error.rcvd and error.rcvd.code == 4410
    expect_close(origin, code, "resume", host_token, 4410)


def expect_close(origin, code, action, token, expected):
    with socket(origin, code, action, token) as peer:
        try:
            peer.recv(timeout=5)
        except ConnectionClosed as error:
            assert error.rcvd and error.rcvd.code == expected
        else:
            raise AssertionError(f"Expected room close code {expected}")


def verify_multiplayer(workbench, origin):
    workbench.report["multiplayer"] = results = {}
    for mode, laps, command in [
        ("sidebar", 3, "Drift 68: Open in Explorer"),
        ("editor", 5, "Drift 68: Open in Editor"),
    ]:
        workbench.command(command)
        game = workbench.open_sidebar("modes") if mode == "sidebar" else workbench.game(mode, "modes")
        if mode == "sidebar":
            workspace = workbench.page.locator(".part.sidebar .pane-header[aria-expanded=true]").filter(
                has_text=re.compile(r"^workspace$", re.IGNORECASE)
            )
            if workspace.count():
                workspace.first.click()
        expect(game.locator("#scene canvas")).to_have_count(0)
        assert game.evaluate(r"""async () => {
            const cover = getComputedStyle(document.querySelector('#scene')).backgroundImage;
            const url = /^url\("(.+)"\)$/.exec(cover)?.[1];
            if (!url) return false;
            const art = new Image();
            art.src = url;
            await art.decode();
            return art.naturalWidth > 0;
        }""")
        csp = game.locator('meta[http-equiv="Content-Security-Policy"]').get_attribute("content")
        assert f"connect-src {origin}/v1/rooms/;" in csp
        assert game.evaluate("""origin => new Promise(resolve => {
            window.addEventListener('securitypolicyviolation', event => {
                resolve(event.effectiveDirective === 'connect-src');
            }, { once: true });
            new WebSocket(origin + '/outside-the-room-path');
            setTimeout(() => resolve(false), 2000);
        })""", origin)

        button(game, "Solo").click()
        button(game, "Head to the start").click()
        game.locator("#scene").click()
        solo = profile(workbench, game)
        button(game, "Pause game").click()
        button(game, "Exit to Title").click()
        button(game, "Play").click()
        button(game, "1v1").click()
        token = uuid.uuid4()
        if mode == "sidebar":
            game.get_by_label("Laps", exact=True).select_option(str(laps))
            button(game, "Create room").click()
            code = game.locator(".room-code").inner_text(timeout=12_000)
            peer = socket(origin, code, "join", token)
        else:
            code = room_code()
            peer = socket(origin, code, "create", token, rules=f".coastal.{laps}")
            game.get_by_label("Room code", exact=True).fill(code.lower())
            game.get_by_label("Room code", exact=True).press("Enter")

        with peer:
            joined = view(peer, lambda state: state["phase"] == "lobby" and state["peer"] and state["peer"]["online"])
            assert joined["laps"] == laps
            with socket(origin, code, "join", uuid.uuid4()) as third:
                try:
                    third.recv(timeout=5)
                    raise AssertionError("A third player joined the room")
                except ConnectionClosed as error:
                    assert error.rcvd and error.rcvd.code == 4409
            if joined["slot"] == 1:
                button(game, "Start race").click()
            else:
                peer.send("start")
            expect(game.locator("#lap-number")).to_have_text(f"LAP 1 / {laps}")
            button(game, "Ready to drive").click()
            view(peer, lambda state: state["peer"]["ready"])
            peer.send("ready")
            expect(game.locator('[data-screen="drive"]')).to_be_visible()
            with LiveOpponent(peer) as opponent:
                multiplayer = profile(workbench, game)
            assert opponent.packets >= 20
            assert multiplayer["drawsPerFrame"] > solo["drawsPerFrame"], "The opponent mesh was not rendered"
            workbench.page.keyboard.down("w")
            expect(game.locator("#speed")).to_have_text(re.compile(r"^[1-9]\d*$"), timeout=10_000)
            workbench.page.keyboard.up("w")
            workbench.page.keyboard.press("Escape")
            expect(game.get_by_text("Race paused", exact=True)).to_be_visible()
            view(peer, lambda state: not state["peer"]["ready"])

        expect(game.get_by_text("Waiting for your opponent to reconnect…", exact=True)).to_be_visible()
        speed = game.locator("#speed").inner_text()
        with socket(origin, code, "resume", token) as peer:
            view(peer, lambda state: state["phase"] == "race")
            expect(game.locator("#speed")).to_have_text(speed)
            button(game, "Ready to drive").click()
            view(peer, lambda state: state["peer"]["ready"])
            peer.send("ready")
            expect(game.locator('[data-screen="drive"]')).to_be_visible()
            if mode == "editor":
                workbench.page.keyboard.press(f"{workbench.modifier}+n")
                workbench.page.wait_for_function("document.activeElement?.closest('.monaco-editor') !== null")
                view(peer, lambda state: not state["peer"]["ready"])
                workbench.command("Drift 68: Open in Editor")
                game = workbench.game(mode, "pause")
                button(game, "Ready to drive").click()
                view(peer, lambda state: state["peer"]["ready"])
                peer.send("ready")
                expect(game.locator('[data-screen="drive"]')).to_be_visible()
            peer.send("finish")
            expect(game.get_by_text("Your opponent won", exact=True)).to_be_visible()
            button(game, "Back to modes").click()
            expect(button(game, "Solo")).to_be_visible()
            peer.send("leave")
        expect(game.locator("#scene canvas")).to_have_count(0)
        results[mode] = {"solo": solo, "multiplayer": multiplayer, "posePackets": opponent.packets}
        print(json.dumps({mode: results[mode]}), flush=True)
        workbench.passed(f"{mode} multiplayer room, CSP, rendering, pause, reconnect, and race result")
    verify_room_cleanup(origin)
    workbench.passed("Durable Object alarm releases a disconnected lobby slot and host leave closes the room")
