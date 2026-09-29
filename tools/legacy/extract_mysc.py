#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
원작 마이스타크래프트(MyStarcraft.exe) 해설·문자열·이미지 추출기

사용법 (Windows, 명령 프롬프트):
    python extract_mysc.py "D:\\MYSC3\\mysc" --repo "C:\\경로\\mystarcraft"

  --repo 를 주면 결과를 저장소 안에 바로 넣는다:
      이미지 → <repo>/client/public/legacy/ (선수, 맵, 로고, 아이템, 기타)
      문자열 → <repo>/data/legacy/
  --repo 를 빼면 현재 폴더의 mysc_extract/ 에 만든다.

만들어지는 파일 (data/legacy/):
    strings.json       exe 안의 한글 문자열 전부 + 그 문자열을 쓰는 코드 위치
    strings.tsv        위 내용을 사람이 읽기 쉽게 (주소, 문자열)
    by_function.txt    코드 함수별로 묶은 문자열 목록 (해설이 어떤 상황에 나오는지 분석용)
    image_paths.tsv    exe 안에 적힌 이미지 경로 (UTF-16)
    summary.txt        개수 요약

추가 설치 없이 파이썬 3.8 이상 기본 기능만 쓴다.
"""
import argparse
import json
import os
import re
import shutil
import struct
import sys

HANGUL = re.compile(r"[\uac00-\ud7a3]")
IMG_EXT = (".gif", ".jpg", ".jpeg", ".png", ".bmp")


def log(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("utf-8", "replace").decode("ascii", "replace"))


# ── PE 파싱 ──────────────────────────────────────────────────────
def parse_pe(data):
    pe = struct.unpack_from("<I", data, 0x3C)[0]
    if data[pe:pe + 4] != b"PE\0\0":
        raise SystemExit("PE 실행 파일이 아닙니다")
    nsec = struct.unpack_from("<H", data, pe + 6)[0]
    optsize = struct.unpack_from("<H", data, pe + 20)[0]
    image_base = struct.unpack_from("<I", data, pe + 24 + 28)[0]
    secs = []
    off = pe + 24 + optsize
    for _ in range(nsec):
        name = data[off:off + 8].rstrip(b"\0").decode("ascii", "replace")
        vsize, va, rawsize, rawptr = struct.unpack_from("<IIII", data, off + 8)
        secs.append({"name": name, "va": image_base + va, "vsize": vsize, "raw": rawptr, "rawsize": rawsize})
        off += 40
    return image_base, secs


def is_clean(text):
    return all(ch in "\r\n\t" or ord(ch) >= 0x20 for ch in text) and "\ufffd" not in text


# ── CP949 문자열 ─────────────────────────────────────────────────
def cp949_strings(data, sec):
    """NUL 로 끝나는 CP949 문자열 중 한글이 들어간 것"""
    out = []
    start, end = sec["raw"], sec["raw"] + sec["rawsize"]
    pos = start
    while pos < end:
        nul = data.find(b"\0", pos, end)
        if nul < 0:
            nul = end
        chunk = data[pos:nul]
        if len(chunk) >= 2:
            # 앞쪽에 다른 데이터가 붙어 있을 수 있어 몇 바이트까지 건너뛰며 시도
            for skip in range(0, min(8, len(chunk) - 1)):
                try:
                    text = chunk[skip:].decode("cp949")
                except UnicodeDecodeError:
                    continue
                if HANGUL.search(text) and is_clean(text):
                    out.append({"va": sec["va"] + (pos + skip - sec["raw"]), "sec": sec["name"], "text": text})
                    break
        pos = nul + 1
    return out


# ── UTF-16 문자열 (이미지 경로 등) ────────────────────────────────
def utf16_strings(data, sec, min_len=4):
    out = []
    start, end = sec["raw"], sec["raw"] + sec["rawsize"]
    for align in (0, 1):
        pos = start + align
        buf, buf_start = [], pos
        while pos + 1 < end:
            unit = data[pos] | (data[pos + 1] << 8)
            if unit == 0:
                if len(buf) >= min_len:
                    text = "".join(buf)
                    # 경로처럼 생긴 것만 (한글 CP949 바이트가 UTF-16 으로 잘못 읽힌 쓰레기 제외)
                    if text.lower().endswith(IMG_EXT) or "//" in text or "\\" in text:
                        out.append({"va": sec["va"] + (buf_start - sec["raw"]), "sec": sec["name"], "text": text})
                buf = []
                buf_start = pos + 2
            elif 0x20 <= unit < 0xD800 or 0xE000 <= unit < 0xFFFE:
                if not buf:
                    buf_start = pos
                buf.append(chr(unit))
            else:
                buf = []
                buf_start = pos + 2
            pos += 2
    seen, uniq = set(), []
    for s in sorted(out, key=lambda x: x["va"]):
        if s["va"] not in seen:
            seen.add(s["va"])
            uniq.append(s)
    return uniq


# ── 코드 참조 (어느 함수가 어떤 문자열을 쓰는지) ────────────────────
OPNAMES = {0x68: "push"}


def find_refs(data, text_sec, targets):
    """코드(.text)에서 문자열 주소가 즉시값으로 쓰인 곳을 찾는다"""
    refs = {}
    start, end = text_sec["raw"], text_sec["raw"] + text_sec["rawsize"]
    code = data[start:end]
    lo, hi = min(targets), max(targets)
    for i in range(1, len(code) - 3):
        v = code[i] | (code[i + 1] << 8) | (code[i + 2] << 16) | (code[i + 3] << 24)
        if v < lo or v > hi or v not in targets:
            continue
        op = code[i - 1]
        opname = OPNAMES.get(op) or ("mov" if 0xB8 <= op <= 0xBF else "c7" if i >= 2 and code[i - 2] == 0xC7 else "%02x" % op)
        at = text_sec["va"] + i
        # 디버그 빌드 함수 시작(push ebp; mov ebp,esp = 55 8B EC)을 뒤로 찾아 함수 단위로 묶음
        fstart = code.rfind(b"\x55\x8b\xec", max(0, i - 400000), i)
        func = text_sec["va"] + fstart if fstart >= 0 else 0
        refs.setdefault(v, []).append({"at": at, "op": opname, "func": func})
    return refs


def copy_images(game_dir, dest):
    src = os.path.join(game_dir, "img")
    if not os.path.isdir(src):
        log("  (img 폴더가 없어 이미지는 건너뜀)")
        return 0
    count = 0
    for root, _dirs, files in os.walk(src):
        for f in files:
            if not f.lower().endswith(IMG_EXT):
                continue  # Thumbs.db 등 제외
            rel = os.path.relpath(os.path.join(root, f), src)
            to = os.path.join(dest, rel)
            os.makedirs(os.path.dirname(to), exist_ok=True)
            shutil.copy2(os.path.join(root, f), to)
            count += 1
    return count


def main():
    ap = argparse.ArgumentParser(description="원작 마이스타크래프트 해설·이미지 추출")
    here = os.path.dirname(os.path.abspath(__file__))
    default_dir = here if os.path.isfile(os.path.join(here, "MyStarcraft.exe")) else r"D:\MYSC3\mysc"
    ap.add_argument("game_dir", nargs="?", default=default_dir, help=r"원작 게임 폴더 (기본: 이 스크립트가 있는 폴더 또는 D:\MYSC3\mysc)")
    ap.add_argument("--repo", help="mystarcraft 저장소 폴더 (주면 결과를 저장소 안에 바로 넣음)")
    ap.add_argument("--out", help="결과 폴더 (기본: ./mysc_extract)")
    ap.add_argument("--no-images", action="store_true", help="이미지 복사 안 함")
    args = ap.parse_args()

    exe = os.path.join(args.game_dir, "MyStarcraft.exe")
    if not os.path.isfile(exe):
        cands = [f for f in os.listdir(args.game_dir) if f.lower().endswith(".exe")] if os.path.isdir(args.game_dir) else []
        if not cands:
            raise SystemExit("MyStarcraft.exe 를 찾지 못했습니다: " + args.game_dir)
        exe = os.path.join(args.game_dir, cands[0])

    if args.repo:
        text_out = os.path.join(args.repo, "data", "legacy")
        img_out = os.path.join(args.repo, "client", "public", "legacy")
    else:
        base = args.out or os.path.join(args.game_dir, "mysc_extract")
        text_out = os.path.join(base, "data", "legacy")
        img_out = os.path.join(base, "client", "public", "legacy")
    os.makedirs(text_out, exist_ok=True)

    log("실행 파일 읽는 중: " + exe)
    with open(exe, "rb") as fh:
        data = fh.read()
    _base, secs = parse_pe(data)
    log("  섹션: " + ", ".join("%s(0x%X)" % (s["name"], s["va"]) for s in secs))

    strings, paths = [], []
    for sec in secs:
        if sec["name"] in (".rdata", ".data"):
            strings += cp949_strings(data, sec)
            paths += utf16_strings(data, sec)
    text_secs = [s for s in secs if s["name"] == ".text"]
    refs = find_refs(data, text_secs[0], {s["va"] for s in strings}) if text_secs else {}
    for s in strings:
        s["refs"] = refs.get(s["va"], [])

    with open(os.path.join(text_out, "strings.json"), "w", encoding="utf-8") as fh:
        json.dump({"exe": os.path.basename(exe), "size": len(data), "strings": strings}, fh, ensure_ascii=False, indent=1)
    with open(os.path.join(text_out, "strings.tsv"), "w", encoding="utf-8") as fh:
        fh.write("주소\t섹션\t참조수\t문자열\n")
        for s in strings:
            fh.write("0x%X\t%s\t%d\t%s\n" % (s["va"], s["sec"], len(s["refs"]), s["text"].replace("\t", "\\t").replace("\r", "\\r").replace("\n", "\\n")))
    with open(os.path.join(text_out, "image_paths.tsv"), "w", encoding="utf-8") as fh:
        fh.write("주소\t경로\n")
        for s in paths:
            fh.write("0x%X\t%s\n" % (s["va"], s["text"]))

    # 함수별 묶음: 같은 함수 안에서 코드 순서대로
    by_func = {}
    for s in strings:
        for r in s["refs"]:
            by_func.setdefault(r["func"], []).append((r["at"], r["op"], s["text"]))
    with open(os.path.join(text_out, "by_function.txt"), "w", encoding="utf-8") as fh:
        for func in sorted(by_func):
            items = sorted(by_func[func])
            fh.write("=== 함수 0x%X (문자열 %d개) ===\n" % (func, len(items)))
            for at, op, text in items:
                fh.write("  0x%X %-5s %s\n" % (at, op, text.replace("\n", "\\n")))
            fh.write("\n")

    n_img = 0
    if not args.no_images:
        log("이미지 복사 중...")
        n_img = copy_images(args.game_dir, img_out)

    summary = [
        "실행 파일: %s (%d 바이트)" % (os.path.basename(exe), len(data)),
        "한글 문자열: %d개 (코드에서 쓰는 것 %d개)" % (len(strings), sum(1 for s in strings if s["refs"])),
        "이미지 경로 문자열: %d개" % len(paths),
        "문자열을 쓰는 함수: %d개" % len(by_func),
        "복사한 이미지: %d개" % n_img,
    ]
    with open(os.path.join(text_out, "summary.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(summary) + "\n")
    log("")
    for line in summary:
        log("  " + line)
    log("")
    log("완료! 문자열: " + text_out)
    if n_img:
        log("      이미지: " + img_out)
    if not args.repo:
        # 한 파일로 묶어서 GitHub 웹에 올리기 쉽게
        zip_path = shutil.make_archive(base, "zip", base)
        log("")
        log("묶음 파일: " + zip_path)
        log("이 zip 파일 하나를 GitHub 에 올려주세요 (docs/legacy-extract.md 참고)")


if __name__ == "__main__":
    double_clicked = len(sys.argv) == 1
    try:
        main()
    except SystemExit as e:
        if e.code not in (None, 0):
            log("오류: %s" % e.code)
    except Exception as e:  # 더블클릭 실행 시 창이 바로 닫히지 않도록
        log("오류: %r" % e)
    if double_clicked:
        input("\n엔터를 누르면 창이 닫힙니다...")
