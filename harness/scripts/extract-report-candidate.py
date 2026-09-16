#!/usr/bin/env python3
import os
import shutil
import stat
import sys
import tarfile
from pathlib import Path, PurePosixPath

MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
MAX_ENTRIES = 1_000
MAX_DEPTH = 16
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_TOTAL_BYTES = 50 * 1024 * 1024
COPY_CHUNK_BYTES = 64 * 1024
TAR_BLOCK_BYTES = 512
ALLOWED_TAR_TYPES = {b"\0", b"0", b"5"}


class BoundedReader:
    def __init__(self, source, limit: int):
        self.source = source
        self.remaining = limit

    def read(self, size: int = -1) -> bytes:
        requested = self.remaining + 1 if size < 0 else min(size, self.remaining + 1)
        content = self.source.read(requested)
        self.remaining -= len(content)
        if self.remaining < 0:
            raise ValueError("candidate archive grew beyond its limit")
        return content


def candidate_path(member_name: str) -> PurePosixPath | None:
    path = PurePosixPath(member_name)
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        raise ValueError("candidate path is unsafe")
    if not path.parts or path.parts[0] != "reports":
        raise ValueError("candidate path is outside reports")
    if len(path.parts) == 1:
        return None
    relative = PurePosixPath(*path.parts[1:])
    return relative


def tar_size(header: bytes) -> int:
    field = header[124:136]
    if field[0] & 0x80:
        return int.from_bytes(field, "big", signed=True)
    value = field.rstrip(b"\0 ").lstrip(b" ") or b"0"
    return int(value, 8)


def preflight_tar(source) -> None:
    entries = 0
    zero_blocks = 0
    while True:
        header = source.read(TAR_BLOCK_BYTES)
        if len(header) != TAR_BLOCK_BYTES:
            raise ValueError("candidate archive is truncated")
        if header == bytes(TAR_BLOCK_BYTES):
            zero_blocks += 1
            if zero_blocks == 2:
                return
            continue
        zero_blocks = 0
        entries += 1
        if entries > MAX_ENTRIES:
            raise ValueError("candidate entry limit exceeded")
        if header[156:157] not in ALLOWED_TAR_TYPES:
            raise ValueError("candidate archive metadata is unsupported")
        size = tar_size(header)
        if size < 0 or size > MAX_FILE_BYTES:
            raise ValueError("candidate archive member size is unsafe")
        padded_size = ((size + TAR_BLOCK_BYTES - 1) // TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES
        remaining = padded_size
        while remaining:
            chunk = source.read(min(COPY_CHUNK_BYTES, remaining))
            if not chunk:
                raise ValueError("candidate archive member is truncated")
            remaining -= len(chunk)


def extract_candidate(archive_path: Path, destination: Path) -> None:
    shutil.rmtree(destination, ignore_errors=True)
    destination.mkdir(mode=0o700, parents=True)
    seen: set[PurePosixPath] = set()
    file_paths: set[PurePosixPath] = set()
    entry_count = 0
    total_bytes = 0
    try:
        descriptor = os.open(
            archive_path,
            os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
        )
        with os.fdopen(descriptor, "rb") as archive_file:
            metadata = os.fstat(archive_file.fileno())
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > MAX_ARCHIVE_BYTES:
                raise ValueError("candidate archive is unsafe")
            bounded_archive = BoundedReader(archive_file, MAX_ARCHIVE_BYTES)
            preflight_tar(bounded_archive)
            archive_file.seek(0)
            bounded_archive = BoundedReader(archive_file, MAX_ARCHIVE_BYTES)
            with tarfile.open(fileobj=bounded_archive, mode="r|") as archive:
                for member in archive:
                    entry_count += 1
                    if entry_count > MAX_ENTRIES:
                        raise ValueError("candidate entry limit exceeded")
                    relative = candidate_path(member.name)
                    if relative is None:
                        root = PurePosixPath(".")
                        if not member.isdir() or root in seen:
                            raise ValueError("candidate root is not a directory")
                        seen.add(root)
                        continue
                    if relative in seen:
                        raise ValueError("candidate uniqueness failed")
                    seen.add(relative)
                    allowed_parts = MAX_DEPTH if member.isdir() else MAX_DEPTH + 1
                    if len(relative.parts) > allowed_parts:
                        raise ValueError("candidate depth limit exceeded")
                    if any(parent in file_paths for parent in relative.parents):
                        raise ValueError("candidate path descends from a file")
                    target = destination / "reports" / Path(*relative.parts)
                    if member.isdir():
                        target.mkdir(mode=0o700, parents=True, exist_ok=True)
                        continue
                    if not member.isfile():
                        raise ValueError("candidate contains a non-regular entry")
                    if member.size > MAX_FILE_BYTES:
                        raise ValueError("candidate file limit exceeded")
                    total_bytes += member.size
                    if total_bytes > MAX_TOTAL_BYTES:
                        raise ValueError("candidate total limit exceeded")
                    file_paths.add(relative)
                    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    source = archive.extractfile(member)
                    if source is None:
                        raise ValueError("candidate file is unreadable")
                    with source, target.open("xb") as output:
                        remaining = member.size
                        while remaining:
                            chunk = source.read(min(COPY_CHUNK_BYTES, remaining))
                            if not chunk:
                                raise ValueError("candidate file ended early")
                            output.write(chunk)
                            remaining -= len(chunk)
    except Exception:
        shutil.rmtree(destination, ignore_errors=True)
        raise


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: extract-report-candidate.py ARCHIVE DESTINATION")
    try:
        extract_candidate(Path(sys.argv[1]), Path(sys.argv[2]))
    except (OSError, tarfile.TarError, ValueError) as error:
        print(f"Candidate evidence extraction blocked: {error}", file=sys.stderr)
        raise SystemExit(1) from error