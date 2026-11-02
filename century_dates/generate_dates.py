import argparse
import datetime
import os

DEFAULT_START = datetime.date(1989, 12, 13)
DEFAULT_END = datetime.date(2089, 12, 13)


def is_valid_time(value):
    """Return True when a 6-digit string is a valid HH:MM:SS time."""
    try:
        hours = int(value[0:2])
        minutes = int(value[2:4])
        seconds = int(value[4:6])
        return 0 <= hours < 24 and 0 <= minutes < 60 and 0 <= seconds < 60
    except (ValueError, IndexError):
        return False


def generate_entries(start_date, end_date):
    """Generate unique YYMMDD, YYYYMMDD, and timestamp-palindrome entries.

    The range spans parts of the 20th and 21st centuries. Entries are
    deduplicated because, for example, 1989 and 2089 share the two-digit year
    ``89`` and therefore produce the same ``891213`` line.
    """
    if start_date > end_date:
        raise ValueError("start_date must not be after end_date")

    entries = []
    seen = set()
    current_date = start_date

    def add(value):
        if value not in seen:
            seen.add(value)
            entries.append(value)

    while current_date <= end_date:
        yymmdd = current_date.strftime("%y%m%d")
        yyyymmdd = current_date.strftime("%Y%m%d")

        add(yymmdd)
        add(yyyymmdd)

        # YYMMDDHHMMSS is a palindrome when HHMMSS is the reverse of YYMMDD.
        hhmmss_candidate = yymmdd[::-1]
        if is_valid_time(hhmmss_candidate):
            add(f"{yymmdd}{hhmmss_candidate}")

        # YYYYMMDDHHMMSS is a palindrome when the day digits match and HHMMSS
        # is the reverse of YYYYMM.
        if yyyymmdd[6] == yyyymmdd[7]:
            hhmmss_candidate = yyyymmdd[0:6][::-1]
            if is_valid_time(hhmmss_candidate):
                add(f"{yyyymmdd}{hhmmss_candidate}")

        current_date += datetime.timedelta(days=1)

    return entries


def write_entries(entries, output_path):
    directory = os.path.dirname(os.path.abspath(output_path))
    os.makedirs(directory, exist_ok=True)

    with open(output_path, "w", encoding="utf-8", newline="\n") as handle:
        for entry in entries:
            handle.write(f"{entry}\n")


def parse_date(value):
    try:
        return datetime.date.fromisoformat(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(f"invalid date: {value}") from error


def main(argv=None):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    default_output = os.path.join(base_dir, "data", "century_dates.txt")

    parser = argparse.ArgumentParser(
        description="Generate palindrome-friendly date strings."
    )
    parser.add_argument(
        "--start",
        type=parse_date,
        default=DEFAULT_START,
        help=f"first date, inclusive (default: {DEFAULT_START.isoformat()})",
    )
    parser.add_argument(
        "--end",
        type=parse_date,
        default=DEFAULT_END,
        help=f"last date, inclusive (default: {DEFAULT_END.isoformat()})",
    )
    parser.add_argument(
        "--output",
        default=default_output,
        help=f"output file (default: {default_output})",
    )
    args = parser.parse_args(argv)

    if args.start > args.end:
        parser.error("--start must not be after --end")

    print(f"Generating dates from {args.start} to {args.end}...")
    entries = generate_entries(args.start, args.end)
    write_entries(entries, args.output)
    print(f"Wrote {len(entries)} unique entries to: {args.output}")


if __name__ == "__main__":
    main()
