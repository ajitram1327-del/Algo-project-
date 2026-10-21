"""
Download Southern Zone OSM PBF extract for Valhalla
"""

import os
import sys
import httpx

URL = "https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf"
DEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "custom_files", "southern-zone-latest.osm.pbf")
TMP_DEST = DEST + ".part"


def download():
    print(f"Connecting to {URL}...")
    headers = {}
    downloaded = 0
    if os.path.exists(TMP_DEST):
        downloaded = os.path.getsize(TMP_DEST)
        headers["Range"] = f"bytes={downloaded}-"
        print(f"Resuming download from {downloaded / (1024 * 1024):.1f} MB...")

    with httpx.stream("GET", URL, headers=headers, follow_redirects=True, timeout=60.0) as resp:
        if resp.status_code not in (200, 206):
            print(f"Failed with status: {resp.status_code}")
            return False

        total = int(resp.headers.get("content-length", 0)) + downloaded
        print(f"Total size: {total / (1024 * 1024):.1f} MB")

        mode = "ab" if downloaded > 0 and resp.status_code == 206 else "wb"
        with open(TMP_DEST, mode) as f:
            chunk_count = 0
            for chunk in resp.iter_bytes(chunk_size=1024 * 512):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    chunk_count += 1
                    if chunk_count % 40 == 0:
                        percent = (downloaded / total) * 100 if total else 0
                        print(f"Progress: {downloaded / (1024 * 1024):.1f} MB / {total / (1024 * 1024):.1f} MB ({percent:.1f}%)")

    if os.path.exists(TMP_DEST):
        if os.path.exists(DEST):
            os.remove(DEST)
        os.rename(TMP_DEST, DEST)
        print(f"Download complete: {DEST} ({os.path.getsize(DEST) / (1024 * 1024):.1f} MB)")
        return True
    return False


if __name__ == "__main__":
    download()
