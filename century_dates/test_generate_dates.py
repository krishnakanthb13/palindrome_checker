import datetime
import unittest

from generate_dates import generate_entries, is_valid_time


class GeneratorTests(unittest.TestCase):
    def test_time_validation(self):
        self.assertTrue(is_valid_time("235959"))
        self.assertFalse(is_valid_time("246000"))
        self.assertFalse(is_valid_time("126000"))
        self.assertFalse(is_valid_time("abc"))

    def test_long_entries_are_palindromes_and_unique(self):
        entries = generate_entries(
            datetime.date(1989, 12, 13),
            datetime.date(1990, 1, 31),
        )

        self.assertEqual(len(entries), len(set(entries)))
        for entry in entries:
            if len(entry) in (12, 14):
                self.assertEqual(entry, entry[::-1], entry)

    def test_full_range_has_no_duplicates(self):
        entries = generate_entries(
            datetime.date(1989, 12, 13),
            datetime.date(2089, 12, 13),
        )
        self.assertEqual(len(entries), len(set(entries)))

    def test_invalid_range_is_rejected(self):
        with self.assertRaises(ValueError):
            generate_entries(datetime.date(2020, 1, 2), datetime.date(2020, 1, 1))


if __name__ == "__main__":
    unittest.main()
