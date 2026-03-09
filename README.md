# Settlement App

매장 정산(카드/현금/배달) 기록 및 주간/월간 요약 앱입니다.

## Run

```bash
cd /Users/baek/Documents/Playground/settlement-app
npm install
npm run dev
```

기본 포트: `3001`  
접속: `http://localhost:3001`

## Data Persistence

- 기본 저장 파일: `/Users/baek/Documents/Playground/settlement-app/data/store.json`
- 인벤토리 앱과 동일하게 프로젝트 내부 JSON 파일에 저장됩니다.
- 커스텀 경로를 쓰려면 `DATA_FILE` 환경변수를 지정하면 됩니다.

## Deploy (Render)

이 저장소 루트에 `render.yaml`이 추가되어 있어 Blueprint로 바로 배포할 수 있습니다.

1. GitHub에 현재 변경사항 푸시
2. Render에서 New + Blueprint 선택
3. 저장소 연결 후 생성

배포 설정:
- 서비스 루트: `settlement-app`
- 헬스체크: `/healthz`
- 영구 디스크: `/var/data` (1GB)
- 데이터 파일: `/var/data/store.json`
