#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
data/legacy/strings.json (extract_mysc.py 결과) → server/bw/legacyLines.ts

원작 exe 의 해설 문장을 코드 함수(=상황)별로 묶어 TypeScript 데이터로 만든다.
같은 함수 안에서 바로 이어서 쓰이는 문장(보통 3개)은 원작이 무작위로 하나를 고르는 묶음이다.

    python tools/legacy/build_lines.py
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "data", "legacy", "strings.json")
OUT = os.path.join(ROOT, "server", "bw", "legacyLines.ts")

# 함수 주소 → 이름 (by_function.txt 를 보고 붙인 이름)
GROUPS = {
    0x447DE0: "situations",   # 종족·유닛·상황별 해설 (묶음 단위)
    0x476BE0: "buildP",       # 프로토스 빌드
    0x472BD0: "buildZ",       # 저그 빌드
    0x474A70: "buildT",       # 테란 빌드
    0x4743D0: "buildZ2",
    0x476420: "buildT2",
    0x47F830: "techP",
    0x478100: "unitP",
    0x48AD40: "techP2",
    0x48E620: "techP3",
    0x47A190: "openZvZ",
    0x47F240: "openTvT",
    0x482A40: "openPvP",
    0x4886D0: "openTvZ",
    0x48DF60: "openPvT",
    0x495E80: "openPvZ",
    0x447390: "start",        # 경기 시작 + 대치
    0x472990: "center",
    0x447150: "ceremony",
    0x4460E0: "ending",
    0x447A60: "cheer",
    0x43F680: "mech",
    0x43FE00: "control",
    0x440230: "baseKill",
    0x440560: "lift",
    0x440610: "surround",
    0x440880: "stopLurker",
    0x4409A0: "scourgeVessel",
    0x4410A0: "multiHarass",
    0x440D50: "mineDrop",
    0x441310: "storm",
    0x441EA0: "empStasis",
    0x47AC40: "release",
}

# 문장 앞에 붙은 쓰레기 바이트 제거 (이름 뒤에 이어 붙는 문장은 ", " 나 " 선수" 로 시작)
JUNK = re.compile(r"^[^가-힣, A-Za-z0-9]{0,3}")


def clean(text):
    t = text.replace("\r", "").replace("\n", " ")
    m = re.search(r"(, | 선수)", t)
    if m and 0 < m.start() <= 3 and not re.match(r"[가-힣]", t[: m.start()]):
        t = t[m.start():]
    return t.rstrip()


def main():
    data = json.load(open(SRC, encoding="utf-8"))["strings"]
    refs = {}
    for s in data:
        for r in s["refs"]:
            refs.setdefault(r["func"], []).append((r["at"], clean(s["text"])))
    out = {}
    for func, name in GROUPS.items():
        items = sorted(refs.get(func, []))
        # 가까운 push 끼리 묶음
        groups, cur, prev = [], [], None
        for at, text in items:
            if prev is not None and at - prev > 12:
                groups.append(cur)
                cur = []
            cur.append(text)
            prev = at
        if cur:
            groups.append(cur)
        out[name] = groups
    lines = [
        "/**",
        " * 원작 마이스타크래프트(ver 1.27.04) 중계 해설 문장",
        " * tools/legacy/build_lines.py 로 data/legacy/strings.json 에서 자동 생성 — 직접 고치지 말 것",
        " * 각 묶음(string[])은 원작이 같은 상황에서 무작위로 하나를 고르는 문장들이다.",
        " * 문장이 \", \" 나 \" 선수\" 로 시작하면 앞에 선수 이름이 붙는다.",
        " */",
        "export const LEGACY_LINES: Record<string, string[][]> = " + json.dumps(out, ensure_ascii=False, indent=1) + ";",
        "",
    ]
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print("생성:", OUT, {k: sum(len(g) for g in v) for k, v in out.items()})


if __name__ == "__main__":
    main()
