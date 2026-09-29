# 원작 해설·이미지 추출 방법

원작 `MyStarcraft.exe` 안에 들어 있는 해설 문장과 `img/` 폴더의 그림을 뽑아 이 저장소에 넣는 방법입니다.
스크립트: `tools/legacy/extract_mysc.py` (파이썬 기본 기능만 사용, 추가 설치 없음)

## 1. 파이썬 설치 (한 번만)

1. https://www.python.org/downloads/ 에서 최신 Python 3 을 받아 설치합니다.
2. 설치 첫 화면에서 **"Add python.exe to PATH"** 를 꼭 체크합니다.
3. 명령 프롬프트(`cmd`)를 열고 `python --version` 을 입력해 버전이 나오면 성공입니다.

## 2. 저장소 최신 코드 받기

- GitHub Desktop: 저장소를 열고 `main` 브랜치에서 **Fetch origin → Pull origin**
- 또는 명령 프롬프트: `cd 저장소폴더` 후 `git checkout main` → `git pull`

## 3. 추출 실행

명령 프롬프트에서 저장소 폴더로 이동한 뒤:

```
python tools\legacy\extract_mysc.py "D:\MYSC3\mysc" --repo .
```

끝나면 이렇게 요약이 나옵니다.

```
  한글 문자열: ○○○개 (코드에서 쓰는 것 ○○○개)
  이미지 경로 문자열: ○○○개
  복사한 이미지: 368개 전후
```

만들어지는 것:

| 위치 | 내용 |
|---|---|
| `client/public/legacy/선수/`, `맵/`, `로고/`, `아이템/`, `기타/` | 원작 GIF 그림 (게임 화면에 자동으로 쓰임) |
| `data/legacy/strings.json`, `strings.tsv` | exe 안의 한글 문자열 전부 (해설·UI·선수 이름) |
| `data/legacy/by_function.txt` | 코드 함수별로 묶은 문자열 (어떤 상황에 어떤 해설이 나오는지 분석용) |
| `data/legacy/image_paths.tsv` | exe 에 적힌 이미지 경로 |

`--repo` 를 빼면 현재 폴더의 `mysc_extract\` 에 따로 만들어집니다 (저장소에 넣기 전에 확인만 하고 싶을 때).

## 4. 올리기

새 브랜치를 만들어 커밋·푸시한 뒤 알려주세요.

```
git checkout -b legacy-assets
git add client/public/legacy data/legacy
git commit -m "원작 이미지·문자열 추출 결과"
git push -u origin legacy-assets
```

PC 에서 Claude Code 를 쓰고 있다면 "tools/legacy/extract_mysc.py 를 D:\MYSC3\mysc 로 실행하고 결과를 legacy-assets 브랜치로 올려줘" 라고 맡겨도 됩니다.

## 주의

- 이 저장소는 **공개(Public)** 저장소입니다. 올린 그림과 문장은 누구나 볼 수 있습니다.
  원하지 않으면 올리기 전에 GitHub 저장소 **Settings → General → Danger Zone → Change repository visibility** 에서 비공개(Private)로 바꾸세요. 자동 배포는 비공개여도 그대로 동작합니다.
- 사이트(mystarcraft.duckdns.org)에 올라간 그림은 저장소 공개 여부와 상관없이 사이트 방문자에게 보입니다.
- 선수 사진·해설 문장은 원작 제작자와 선수 본인의 권리가 있는 자료입니다. 공개 서비스에 쓸지는 직접 판단해 주세요.
