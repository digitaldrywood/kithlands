#!/usr/bin/env python3
"""Audit content-driven battle-character atlases and authored state frames."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from audit_walk_sheets import decode_rgba, png_header


def frame_has_pixels(
    rgba: bytes, image_width: int, frame_size: int, frame_index: int
) -> bool:
    x0 = frame_index * frame_size
    for y in range(frame_size):
        for x in range(x0, x0 + frame_size):
            if rgba[(y * image_width + x) * 4 + 3] > 8:
                return True
    return False


def audit_profile(
    repo_root: Path,
    profile: dict[str, object],
    required_states: list[str],
    frame_size: int,
    require_complete: bool,
) -> list[str]:
    profile_id = str(profile.get("id", ""))
    states = profile.get("states", {})
    attachments = profile.get("attachments", {})
    errors: list[str] = []
    if not isinstance(states, dict):
        return [f"{profile_id}: states must be an object"]

    if require_complete:
        missing = [state for state in required_states if state not in states]
        if missing:
            errors.append(f"{profile_id}: missing states: {', '.join(missing)}")

    decoded: dict[Path, tuple[dict[str, int], bytes]] = {}
    for state_id, state_value in states.items():
        state = state_value if isinstance(state_value, dict) else {}
        if state.get("hold_last_frame") and state_id != "ko_defeated":
            errors.append(f"{profile_id}/{state_id}: only ko_defeated may hold")
        body_path = str(state.get("body_path", ""))
        asset_path = repo_root / "client/public" / body_path.lstrip("/")
        if not asset_path.is_file():
            errors.append(f"{profile_id}/{state_id}: missing {asset_path}")
            continue
        if asset_path not in decoded:
            try:
                header = png_header(asset_path)
                decoded[asset_path] = decode_rgba(asset_path)
            except (OSError, ValueError) as exc:
                errors.append(f"{profile_id}/{state_id}: {exc}")
                continue
            if header["height"] != frame_size or header["width"] % frame_size != 0:
                errors.append(
                    f"{profile_id}/{state_id}: {header['width']}x{header['height']} "
                    f"does not use {frame_size}px horizontal cells"
                )
        header, rgba = decoded[asset_path]
        frame_count = header["width"] // frame_size
        frames = state.get("frames", [])
        if not isinstance(frames, list) or not frames:
            errors.append(f"{profile_id}/{state_id}: no frames")
            continue
        for index, frame_value in enumerate(frames):
            frame = frame_value if isinstance(frame_value, dict) else {}
            atlas_frame = frame.get("frame")
            if not isinstance(atlas_frame, int) or not 0 <= atlas_frame < frame_count:
                errors.append(
                    f"{profile_id}/{state_id}[{index}]: frame {atlas_frame!r} "
                    f"outside 0..{frame_count - 1}"
                )
                continue
            if not frame_has_pixels(rgba, header["width"], frame_size, atlas_frame):
                errors.append(f"{profile_id}/{state_id}[{index}]: empty frame {atlas_frame}")
            if not isinstance(frame.get("duration"), int) or frame["duration"] <= 0:
                errors.append(f"{profile_id}/{state_id}[{index}]: invalid duration")
            body = frame.get("body", {})
            if not isinstance(body, dict):
                errors.append(f"{profile_id}/{state_id}[{index}]: body must be an object")
                body = {}
            for key in ("x", "y"):
                value = body.get(key, 0)
                if not isinstance(value, (int, float)) or abs(value) > frame_size:
                    errors.append(f"{profile_id}/{state_id}[{index}]: invalid body {key}")
            angle = body.get("angle", 0)
            if not isinstance(angle, (int, float)) or abs(angle) > 180:
                errors.append(f"{profile_id}/{state_id}[{index}]: invalid body angle")
            frame_attachments = frame.get("attachments", {})
            if not isinstance(frame_attachments, dict):
                errors.append(
                    f"{profile_id}/{state_id}[{index}]: attachments must be an object"
                )
                continue
            unknown = set(frame_attachments) - set(attachments)
            if unknown:
                errors.append(
                    f"{profile_id}/{state_id}[{index}]: unknown attachments "
                    f"{', '.join(sorted(unknown))}"
                )
            missing_attachments = set(attachments) - set(frame_attachments)
            if missing_attachments:
                errors.append(
                    f"{profile_id}/{state_id}[{index}]: missing attachments "
                    f"{', '.join(sorted(missing_attachments))}"
                )
            for attachment_id, pose in frame_attachments.items():
                if not isinstance(pose, dict):
                    errors.append(
                        f"{profile_id}/{state_id}[{index}]: {attachment_id} pose must be an object"
                    )
                elif "visible" in pose and not isinstance(pose["visible"], bool):
                    errors.append(
                        f"{profile_id}/{state_id}[{index}]: {attachment_id} visible must be boolean"
                    )
    return errors


def main() -> int:
    repo_root = Path(__file__).resolve().parents[3]
    parser = argparse.ArgumentParser()
    parser.add_argument("--shared", type=Path, default=repo_root / "shared")
    parser.add_argument("--classes", nargs="+", default=["warrior"])
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()

    catalog = json.loads((args.shared / "battle_characters.json").read_text())
    profiles = {profile["id"]: profile for profile in catalog["classes"]}
    errors: list[str] = []
    for class_id in args.classes:
        profile = profiles.get(class_id)
        if profile is None:
            errors.append(f"unknown battle character {class_id}")
            continue
        profile_errors = audit_profile(
            repo_root,
            profile,
            catalog["required_states"],
            catalog["frame_size"],
            args.require_complete,
        )
        errors.extend(profile_errors)
        if not profile_errors:
            print(f"PASS {class_id}: {len(profile['states'])} states")

    if errors:
        for error in errors:
            print(f"FAIL {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
