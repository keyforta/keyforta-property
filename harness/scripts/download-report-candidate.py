#!/usr/bin/env python3
import json
import os
import stat
import struct
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

MAX_ZIP_BYTES = 65 * 1024 * 1024
MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
COPY_CHUNK_BYTES = 64 * 1024
ARCHIVE_NAME = "keyforta-report-candidate.tar"
EOCD_SIGNATURE = b"PK\x05\x06"


class SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self, request, file_pointer, code, message, headers, new_url
    ):
        redirected = super().redirect_request(
            request, file_pointer, code, message, headers, new_url
        )
        source = urllib.parse.urlsplit(request.full_url)
        target = urllib.parse.urlsplit(new_url)
        if (
            redirected
            and (
                target.scheme != "https"
                or source.scheme != "https"
                or target.netloc != source.netloc
            )
        ):
            redirected.remove_header("Authorization")
        return redirected


def api_request(url: str, token: str) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "keyforta-trusted-evidence-retention",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )


def copy_bounded(source, destination, limit: int) -> None:
    consumed = 0
    while True:
        chunk = source.read(min(COPY_CHUNK_BYTES, limit - consumed + 1))
        if not chunk:
            return
        consumed += len(chunk)
        if consumed > limit:
            raise ValueError("artifact byte limit exceeded")
        destination.write(chunk)


def require_single_zip_entry(zip_path: Path) -> None:
    size = zip_path.stat().st_size
    with zip_path.open("rb") as source:
        source.seek(max(0, size - (65_535 + 22)))
        tail = source.read()
    offset = tail.rfind(EOCD_SIGNATURE)
    if offset < 0 or len(tail) - offset < 22:
        raise ValueError("candidate artifact ZIP footer is missing")
    disk, directory_disk, disk_entries, total_entries = struct.unpack_from(
        "<HHHH", tail, offset + 4
    )
    comment_length = struct.unpack_from("<H", tail, offset + 20)[0]
    if (
        offset + 22 + comment_length != len(tail)
        or disk != 0
        or directory_disk != 0
        or disk_entries != 1
        or total_entries != 1
    ):
        raise ValueError("candidate artifact must contain one non-ZIP64 entry")


def download_candidate() -> None:
    token = os.environ["GITHUB_TOKEN"]
    repository = os.environ["GITHUB_REPOSITORY"]
    run_id = os.environ["KEYFORTA_ARTIFACT_RUN_ID"]
    artifact_name = os.environ["KEYFORTA_ARTIFACT_NAME"]
    destination = Path(os.environ["KEYFORTA_ARTIFACT_DESTINATION"])
    query = urllib.parse.urlencode({"name": artifact_name, "per_page": 2})
    list_url = (
        f"https://api.github.com/repos/{repository}/actions/runs/"
        f"{run_id}/artifacts?{query}"
    )
    opener = urllib.request.build_opener(SafeRedirectHandler())
    with opener.open(api_request(list_url, token), timeout=30) as response:
        payload = json.load(response)
    artifacts = payload.get("artifacts", [])
    if payload.get("total_count") != 1 or len(artifacts) != 1:
        raise ValueError("expected exactly one candidate artifact")
    artifact = artifacts[0]
    if artifact.get("name") != artifact_name or artifact.get("expired"):
        raise ValueError("candidate artifact identity is invalid")
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    zip_path = destination.with_suffix(".zip")
    try:
        request = api_request(artifact["archive_download_url"], token)
        with opener.open(request, timeout=30) as response:
            with zip_path.open("xb") as output:
                copy_bounded(response, output, MAX_ZIP_BYTES)
        require_single_zip_entry(zip_path)
        with zipfile.ZipFile(zip_path) as archive:
            entries = archive.infolist()
            if len(entries) != 1:
                raise ValueError("candidate artifact must contain one file")
            entry = entries[0]
            mode = entry.external_attr >> 16
            file_type = stat.S_IFMT(mode)
            if (
                entry.filename != ARCHIVE_NAME
                or entry.is_dir()
                or entry.flag_bits & 1
                or entry.file_size > MAX_ARCHIVE_BYTES
                or file_type not in (0, stat.S_IFREG)
            ):
                raise ValueError("candidate artifact entry is unsafe")
            with archive.open(entry) as source, destination.open("xb") as output:
                copy_bounded(source, output, MAX_ARCHIVE_BYTES)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        zip_path.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        download_candidate()
    except (
        KeyError,
        OSError,
        ValueError,
        urllib.error.URLError,
        zipfile.BadZipFile,
    ) as error:
        print(f"Candidate evidence download blocked: {error}", file=sys.stderr)
        raise SystemExit(1) from error