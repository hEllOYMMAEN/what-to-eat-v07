# 뭐먹지? v0.8 — 연령대별 메뉴 탐색 + 메뉴 확장

기존 v0.7의 음식 추천, 조건 필터, 즐겨찾기, 카카오 주변 음식점 검색/지도 기능을 유지하면서 연령대별 선택 필터를 추가했습니다.

## 변경 내용
- `전체 연령`, `10대`, `20대`, `30~40대`, `50대 이상` 중 선택 가능 (선택 사항)
- 음식 데이터가 100개에서 159개로 확대됨
- 각 음식에 `ageGroups` 태그 추가, 서버가 연령대 조건도 필터링
- 연령대 태그는 **설명용/편집자가 설정한 탐색 기준**이며 실제 연령별 선호도 조사 결과가 아닙니다. 연령에 관계없이 모든 음식을 추천받으려면 `전체 연령` 선택
- `server/index.js`가 `dist` 정적 파일을 서빙해 Render 단일 서비스 배포 지원

## 로컬 실행
1. `npm install`
2. 프로젝트 루트에 `.env` 생성 후 `.env.example` 참고하여 카카오 키 입력
3. 개발 모드: `npm run dev:all`
4. 배포 모드 확인: `npm run build` 후 `npm run server` → `http://localhost:3001`

## Render 반영
기존 GitHub 저장소에 이 버전의 파일을 복사하고 `git add .`, `git commit -m "Add age group filter and more menus"`, `git push origin main` 실행. Render 자동 배포가 켜져 있으면 반영됩니다.

**주의:** 기존 프로젝트의 실제 `.env`는 덮어쓰지 마세요. 카카오 키를 GitHub에 올리지 마세요.

## 데이터 수정
`server/data/menus.json`에서 이름, 가격, 분류, `ageGroups`를 수정하고 서버를 재시작/재배포하세요. 각 음식 `id`는 고유해야 합니다. 가격은 예시이며 실제 매장 가격이 아닙니다.
