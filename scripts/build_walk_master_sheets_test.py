import importlib.util
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image


MODULE_PATH = Path(__file__).with_name("build_walk_master_sheets.py")
SPEC = importlib.util.spec_from_file_location("build_walk_master_sheets", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class BuildWalkMasterSheetsTest(unittest.TestCase):
    def test_non_knight_rows_match_runtime_direction_order(self):
        expected = ["down", "up", "left", "right"]
        self.assertEqual(MODULE.sheet_row_directions("warrior"), expected)

    def test_knight_keeps_side_row_source_swap(self):
        expected = ["down", "up", "right", "left"]
        self.assertEqual(MODULE.sheet_row_directions("knight"), expected)

    def test_build_sheet_uses_declared_row_order_for_default_classes(self):
        self.assert_row_colors(
            "warrior",
            ["down", "up", "left", "right"],
        )

    def test_build_sheet_uses_knight_specific_side_row_order(self):
        self.assert_row_colors(
            "knight",
            ["down", "up", "right", "left"],
        )

    def assert_row_colors(self, class_id, expected_rows):
        colors = {
            "down": (255, 0, 0, 255),
            "up": (0, 255, 0, 255),
            "left": (0, 0, 255, 255),
            "right": (255, 255, 0, 255),
        }
        masters = {
            direction: Image.new("RGBA", (MODULE.CELL, MODULE.CELL), color)
            for direction, color in colors.items()
        }

        with (
            mock.patch.object(MODULE, "load_masters", return_value=masters),
            mock.patch.object(MODULE, "prepare_master", side_effect=lambda _direction, img, _target_h: img),
            mock.patch.object(MODULE, "alpha_bbox", return_value=(0, 0, MODULE.CELL, MODULE.CELL)),
            mock.patch.object(MODULE, "pose_frame", side_effect=lambda base, _direction, _frame_idx: base),
        ):
            sheet = MODULE.build_sheet_for_class(class_id)

        for row_idx, direction in enumerate(expected_rows):
            pixel = sheet.getpixel((0, row_idx * MODULE.CELL))
            self.assertEqual(pixel, colors[direction])


if __name__ == "__main__":
    unittest.main()
