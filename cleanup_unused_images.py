#!/usr/bin/env python3
"""
Cleanup unused images in the downloads directory based on src/app/file.csv.

By default this runs in dry-run mode and only prints what would be deleted.
Use --apply to actually delete the unused images.

Example:
  python3 cleanup_unused_images.py \
    --csv src/app/file.csv \
    --images-dir public/downloads \
    --apply
"""

import argparse
import csv
import os
import sys
from typing import Iterable, List, Set, Tuple


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Delete files in an images directory that are not referenced in a CSV file."
    )
    parser.add_argument(
        "--csv",
        dest="csv_path",
        default=os.path.join("src", "app", "file.csv"),
        help="Path to CSV file containing a 'filename' column (default: src/app/file.csv)",
    )
    parser.add_argument(
        "--images-dir",
        dest="images_dir",
        default=os.path.join("public", "downloads"),
        help="Directory containing images to check (default: public/downloads)",
    )
    parser.add_argument(
        "--extensions",
        dest="extensions",
        default="jpg,jpeg,png",
        help="Comma-separated list of allowed image file extensions (default: jpg,jpeg,png)",
    )
    parser.add_argument(
        "--apply",
        dest="apply",
        action="store_true",
        help="Actually delete unused files. Without this flag, runs as a dry-run.",
    )
    parser.add_argument(
        "--verbose",
        dest="verbose",
        action="store_true",
        help="Print additional details while running.",
    )
    return parser.parse_args()


def normalize_name(name: str) -> str:
    return name.strip().lower()


def load_referenced_filenames(csv_path: str) -> Set[str]:
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    referenced: Set[str] = set()
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if "filename" not in (reader.fieldnames or []):
            raise ValueError(
                "CSV is missing required 'filename' header. Found: "
                + ", ".join(reader.fieldnames or [])
            )
        for row in reader:
            value = (row.get("filename") or "").strip()
            if value:
                referenced.add(normalize_name(os.path.basename(value)))
    return referenced


def list_image_files(images_dir: str, allowed_exts: Set[str]) -> List[str]:
    if not os.path.isdir(images_dir):
        raise NotADirectoryError(f"Images directory not found: {images_dir}")

    result: List[str] = []
    for entry in os.listdir(images_dir):
        full_path = os.path.join(images_dir, entry)
        if not os.path.isfile(full_path):
            continue
        if entry == ".DS_Store":
            continue
        ext = os.path.splitext(entry)[1].lstrip(".").lower()
        if ext in allowed_exts:
            result.append(entry)
    return result


def partition_unused(
    present_files: Iterable[str], referenced: Set[str]
) -> Tuple[List[str], List[str]]:
    present_norm: Set[str] = {normalize_name(x) for x in present_files}

    unused_files: List[str] = [
        fname for fname in present_files if normalize_name(fname) not in referenced
    ]
    missing_refs: List[str] = [ref for ref in referenced if ref not in present_norm]
    return unused_files, missing_refs


def print_sample(items: List[str], label: str, max_items: int = 50) -> None:
    count = len(items)
    if count == 0:
        print(f"{label}: none")
        return
    print(f"{label} ({count}):")
    to_show = items[:max_items]
    for item in to_show:
        print(f"  - {item}")
    if count > max_items:
        print(f"  ... and {count - max_items} more")


def delete_files(images_dir: str, files: List[str], verbose: bool = False) -> Tuple[int, int]:
    deleted = 0
    failed = 0
    for fname in files:
        path = os.path.join(images_dir, fname)
        try:
            os.remove(path)
            deleted += 1
            if verbose:
                print(f"deleted: {fname}")
        except Exception as exc:  # noqa: BLE001 - best-effort deletion
            failed += 1
            print(f"failed to delete: {fname} -> {exc}")
    return deleted, failed


def main() -> int:
    args = parse_args()

    images_dir = args.images_dir
    csv_path = args.csv_path
    allowed_exts = {ext.strip().lower() for ext in args.extensions.split(",") if ext.strip()}

    if args.verbose:
        print(f"CSV: {csv_path}")
        print(f"Images dir: {images_dir}")
        print(f"Extensions: {sorted(allowed_exts)}")
        print(f"Mode: {'APPLY' if args.apply else 'DRY-RUN'}")

    referenced = load_referenced_filenames(csv_path)
    present_files = list_image_files(images_dir, allowed_exts)
    unused_files, missing_refs = partition_unused(present_files, referenced)

    print_sample(unused_files, label="Unused files in directory not referenced by CSV")
    print_sample(missing_refs, label="CSV filenames missing from directory (FYI)")

    print()
    print(
        f"Summary: present={len(present_files)}, referenced={len(referenced)}, "
        f"unused={len(unused_files)}, missing={len(missing_refs)}"
    )

    if not args.apply:
        print("Dry-run complete. Re-run with --apply to delete the unused files.")
        return 0

    if unused_files:
        print(f"Deleting {len(unused_files)} unused file(s)...")
        deleted, failed = delete_files(images_dir, unused_files, verbose=args.verbose)
        print(f"Done. deleted={deleted}, failed={failed}")
    else:
        print("No unused files to delete.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted.")
        raise SystemExit(130)


