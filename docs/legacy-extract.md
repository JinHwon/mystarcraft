# 원작 해설·이미지 추출 방법

원작 `MyStarcraft.exe` 안에 들어 있는 해설 문장과 `img/` 폴더의 그림을 뽑아 이 저장소에 넣는 방법입니다.
스크립트: `tools/legacy/extract_mysc.py` (파이썬 기본 기능만 사용, 추가 설치 없음)

## 가장 쉬운 방법 (git 없이)

### 1. 파이썬 설치 (한 번만)

1. https://www.python.org/downloads/ 에서 **Download Python 3.x** 를 받아 실행합니다.
2. 설치 첫 화면 아래의 **"Add python.exe to PATH"** 를 꼭 체크하고 **Install Now**.
3. 명령 프롬프트(`cmd`)를 **새로 열고** `python --version` 을 입력합니다. `Python 3.x.x` 처럼 버전이 나오면 성공입니다.
   - `python` 을 입력했는데 **`Python` 한 단어만 나오거나 Microsoft Store 가 열리면** 아직 설치가 안 된 것입니다 (Windows 가 넣어둔 가짜 바로가기).
     위 1~2번으로 설치하고, 그래도 같으면 **설정 → 앱 → 고급 앱 설정 → 앱 실행 별칭** 에서 `python.exe`, `python3.exe` 를 **끔** 으로 바꿉니다.

### 2. 스크립트 받기

아래 주소를 브라우저에서 열고 **Ctrl+S** 로 `D:\MYSC3\mysc` 폴더(MyStarcraft.exe 가 있는 폴더)에 `extract_mysc.py` 이름으로 저장합니다.

https://raw.githubusercontent.com/JinHwon/mystarcraft/main/tools/legacy/extract_mysc.py

(명령 프롬프트로 받으려면: `cd /d D:\MYSC3\mysc` 후
`curl -L -o extract_mysc.py https://raw.githubusercontent.com/JinHwon/mystarcraft/main/tools/legacy/extract_mysc.py`)

### 3. 실행

`D:\MYSC3\mysc\extract_mysc.py` 를 **더블클릭**하거나, 명령 프롬프트에서:

```
cd /d D:\MYSC3\mysc
python extract_mysc.py
```

끝나면 요약과 함께 `D:\MYSC3\mysc\mysc_extract.zip` 파일이 만들어집니다.

```
  한글 문자열: ○○○개 (코드에서 쓰는 것 ○○○개)
  복사한 이미지: 368개 전후
묶음 파일: D:\MYSC3\mysc\mysc_extract.zip
```

### 4. zip 파일 올리기 (GitHub 웹)

1. https://github.com/JinHwon/mystarcraft/upload/main 을 엽니다 (저장소 → **Add file → Upload files** 와 같음).
2. `mysc_extract.zip` 을 끌어다 놓습니다.
3. 아래에서 **"Create a new branch for this commit and start a pull request"** 를 고르고, 브랜치 이름을 `legacy-assets` 로 합니다.
4. **Propose changes** → 다음 화면에서 **Create pull request** 까지 누르면 끝입니다. 머지는 하지 말고 알려주세요. 제가 풀어서 정리한 뒤 반영합니다.

## 저장소를 PC 에 받아 둔 경우

저장소 폴더에서 실행하면 결과를 저장소 안에 바로 넣습니다.

```
python tools\legacy\extract_mysc.py "D:\MYSC3\mysc" --repo .
```

| 위치 | 내용 |
|---|---|
| `client/public/legacy/선수/`, `맵/`, `로고/`, `아이템/`, `기타/` | 원작 GIF 그림 (게임 화면에 자동으로 쓰임) |
| `data/legacy/strings.json`, `strings.tsv` | exe 안의 한글 문자열 전부 (해설·UI·선수 이름) |
| `data/legacy/by_function.txt` | 코드 함수별로 묶은 문자열 (어떤 상황에 어떤 해설이 나오는지 분석용) |
| `data/legacy/image_paths.tsv` | exe 에 적힌 이미지 경로 |

그다음 `legacy-assets` 브랜치로 커밋·푸시합니다.

## 주의

- 이 저장소는 **공개(Public)** 저장소입니다. 올린 그림과 문장은 누구나 볼 수 있습니다.
  원하지 않으면 올리기 전에 GitHub 저장소 **Settings → General → Danger Zone → Change repository visibility** 에서 비공개(Private)로 바꾸세요. 자동 배포는 비공개여도 그대로 동작합니다.
- 사이트(mystarcraft.duckdns.org)에 올라간 그림은 저장소 공개 여부와 상관없이 사이트 방문자에게 보입니다.
- 선수 사진·해설 문장은 원작 제작자와 선수 본인의 권리가 있는 자료입니다. 공개 서비스에 쓸지는 직접 판단해 주세요.
