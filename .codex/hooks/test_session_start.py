import json
import os
from pathlib import Path
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / ".codex/hooks/session_start.py"
CONFIG = ROOT / ".codex/hooks.json"
ALLOWED_SOURCES = ("startup", "resume", "clear", "compact")


class SessionStartHookTests(unittest.TestCase):
    def run_script(self, raw_input, *, cwd=ROOT, env=None):
        return subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=raw_input,
            text=True,
            capture_output=True,
            cwd=cwd,
            env=env,
            check=False,
        )

    def test_allowed_sources_emit_fixed_context(self):
        contexts = []
        for source in ALLOWED_SOURCES:
            with self.subTest(source=source):
                result = self.run_script(json.dumps({"source": source}))
                self.assertEqual(result.returncode, 0)
                self.assertEqual(result.stderr, "")
                output = json.loads(result.stdout)
                self.assertEqual(set(output), {"hookSpecificOutput"})
                hook_output = output["hookSpecificOutput"]
                self.assertEqual(
                    set(hook_output), {"hookEventName", "additionalContext"}
                )
                self.assertEqual(hook_output["hookEventName"], "SessionStart")
                contexts.append(hook_output["additionalContext"])

        self.assertEqual(len(set(contexts)), 1)
        context = contexts[0]
        for sentinel in (
            "Project continuity guard:",
            "AGENTS.md",
            ".agent/progress.md",
            "Graphify -> CodeGraph -> Serena",
            "Web + Context7",
            "Sosumi: N/A",
            "Do not guess",
            "Tests first",
            "gpt-5.3-codex-spark",
            "no fallback",
            "read-only adversarial review",
            "CHANGELOG.md",
            "explicitly stage",
            "signed task commit",
            "active milestone scope",
            "latest explicit user authorization",
            "Do not carry completed-milestone prohibitions forward",
            "package installation",
            "Docker execution",
            "socket probes",
            "EW11/private-LAN access",
            "device changes",
            "push",
        ):
            self.assertIn(sentinel, context)
        self.assertNotIn("M0 continuity guard", context)
        self.assertNotIn("do not implement app code", context)

    def test_invalid_inputs_are_silent_successes(self):
        for raw_input in (
            '{"source":"future"}',
            '{"source":[]}',
            '{"source":{}}',
            "{",
            "{}",
            "",
        ):
            with self.subTest(raw_input=raw_input):
                result = self.run_script(raw_input)
                self.assertEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")
                self.assertEqual(result.stderr, "")

    def test_input_and_environment_secrets_are_not_echoed(self):
        secret = "M0_TEST_SECRET_DO_NOT_ECHO"
        env = os.environ.copy()
        env["M0_TEST_SECRET"] = secret
        result = self.run_script(
            json.dumps(
                {
                    "source": "compact",
                    "transcript_path": secret,
                    "cwd": secret,
                    "untrusted": secret,
                }
            ),
            env=env,
        )
        self.assertEqual(result.returncode, 0)
        self.assertNotIn(secret, result.stdout)
        self.assertNotIn(secret, result.stderr)

    def test_hooks_json_adds_exact_session_allowlist(self):
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
        session_start = config["hooks"]["SessionStart"]
        self.assertEqual(len(session_start), 1)
        self.assertEqual(
            session_start[0]["matcher"],
            "^(?:startup|resume|clear|compact)$",
        )
        self.assertEqual(len(session_start[0]["hooks"]), 1)
        handler = session_start[0]["hooks"][0]
        self.assertEqual(handler["type"], "command")
        self.assertEqual(
            handler["command"],
            'python3 "$(git rev-parse --show-toplevel)/.codex/hooks/session_start.py"',
        )
        self.assertEqual(handler["statusMessage"], "Loading project continuity guard")
        self.assertGreater(handler["timeout"], 0)
        self.assertLessEqual(handler["timeout"], 5)
        self.assertGreater(handler["additionalContextLimit"], 0)
        self.assertLessEqual(handler["additionalContextLimit"], 1200)

    def test_configured_command_resolves_from_a_subdirectory(self):
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
        handler = config["hooks"]["SessionStart"][0]["hooks"][0]
        result = subprocess.run(
            handler["command"],
            input=json.dumps({"source": "resume"}),
            text=True,
            capture_output=True,
            cwd=Path(__file__).parent,
            shell=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(
            output["hookSpecificOutput"]["hookEventName"], "SessionStart"
        )


if __name__ == "__main__":
    unittest.main()
