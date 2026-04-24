import argparse
import os
import time

import requests


def upload_image(api_base: str, file_path: str) -> str:
    with open(file_path, "rb") as f:
        files = {"file": (os.path.basename(file_path), f)}
        r = requests.post(f"{api_base}/api/upload/image", files=files, timeout=60)
    r.raise_for_status()
    j = r.json() or {}
    if not j.get("success"):
        raise Exception(j.get("message") or "upload_failed")
    url = ((j.get("data") or {}).get("image_url") or "").strip()
    if not url:
        raise Exception("upload_no_url")
    return url


def wait_task(api_base: str, task_id: str, timeout_s: int = 900) -> dict:
    start = time.time()
    while time.time() - start < timeout_s:
        r = requests.get(f"{api_base}/api/virtual-tryon/task/{task_id}", timeout=30)
        r.raise_for_status()
        j = r.json() or {}
        if not j.get("success"):
            raise Exception(j.get("message") or "task_query_failed")
        data = j.get("data") or {}
        st = str(data.get("status") or "").lower()
        if st in ("completed", "failed", "canceled"):
            return data
        time.sleep(2)
    raise Exception("task_timeout")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--api-base", default=os.getenv("AI_BACKEND_BASE_URL", "http://127.0.0.1:8000"))
    p.add_argument("--person", required=True)
    p.add_argument("--garment", required=True)
    p.add_argument("--type", default="top", choices=["top", "bottom", "dress"])
    args = p.parse_args()

    api_base = args.api_base.rstrip("/")
    person_url = upload_image(api_base, args.person)
    garment_url = upload_image(api_base, args.garment)

    payload = {"person_image_url": person_url, "garment_image_url": garment_url, "garment_type": args.type}
    r = requests.post(f"{api_base}/api/virtual-tryon", json=payload, timeout=60)
    r.raise_for_status()
    j = r.json() or {}
    if not j.get("success"):
        raise Exception(j.get("message") or "tryon_request_failed")
    data = j.get("data") or {}
    immediate = (data.get("image_url") or data.get("imageUrl") or "").strip()
    if immediate:
        print(immediate)
        return
    task_id = (data.get("task_id") or "").strip()
    if not task_id:
        raise Exception("no_task_id")
    out = wait_task(api_base, task_id)
    print(out.get("image_url") or out.get("final_image_url") or "")
    if out.get("trace_id"):
        print("trace_id:", out.get("trace_id"))


if __name__ == "__main__":
    main()
