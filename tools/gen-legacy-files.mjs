#!/usr/bin/env node
/**
 * client/public/legacy 에 실제로 있는 원작 이미지 목록을 만든다 (client/src/lib/legacyFiles.ts)
 * 화면은 이 목록에 있는 그림만 서버에 요청하고, 없는 그림은 바로 대체 그림을 그린다
 * (예전엔 없는 그림도 요청해 404·서버 오류 로그가 계속 쌓였음). 빌드 때 자동으로 실행됨
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const base = join(root, "client/public/legacy");
const out = join(root, "client/src/lib/legacyFiles.ts");
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(base, p).split("\\").join("/").normalize("NFC"));
  }
})(base);
writeFileSync(out, `// 자동 생성 파일 (tools/gen-legacy-files.mjs) — 직접 고치지 마세요\n/** client/public/legacy 안에 있는 그림 ("폴더/파일") */\nexport const LEGACY_FILES: ReadonlySet<string> = new Set(${JSON.stringify(files, null, 0)});\n`);
console.log(`legacy 그림 ${files.length}개 목록을 만들었습니다`);
