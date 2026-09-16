# 조경호 회계사 서비스 사이트

HTML/CSS/JS로 구성된 회계감사 및 내부회계 서비스 사이트입니다.

## 구성

- `index.html`: 회계감사 랜딩페이지와 기존 신청 폼
- `audit-fees/`, `first-audit/`: 외부감사 비용·준비 안내
- `services/`: 서비스 소개
- `internal-control/`: 내부회계 구축·운영 지원 페이지와 전용 상담 폼
- `api/internal-control-inquiry.js`: 저장 확인 응답을 검증하는 Vercel 함수
- `integrations/internal-control-inquiry.gs`: 별도 Google Apps Script 수신기
- `service-pages.css`: 서비스 페이지 공통 스타일
- `images/`: 페이지에서 사용하는 WebP 이미지

## 배포

기존 Vercel 프로젝트 `audit-proposal-landing`의 루트에서 배포합니다. 정적 페이지는 별도 빌드가 필요 없으며, 내부회계 문의 API는 `/api`의 Node.js 함수를 사용합니다. 함수 응답 제한은 `vercel.json`에서 30초로 설정합니다.

내부회계 문의를 실제로 받으려면 [수신 연결 안내](docs/internal-control-inquiry-setup.md)에 따라 전용 수신기와 서버 환경 변수를 설정해야 합니다. 연결 전에는 신청 버튼이 비활성화되고, 작성 내용 복사만 사용할 수 있습니다. 기존 회계감사 신청 경로는 유지합니다.

정적 호스팅만으로는 내부회계 문의 API가 동작하지 않습니다. 이번 변경은 문의 수신 연결과 미리보기 확인 후 운영 반영할 초안입니다.

## 검증

```sh
node --test tests/internal-control-inquiry*.test.js
```

테스트는 외부 호출을 모의 처리하며 실제 문의를 전송하지 않습니다.
