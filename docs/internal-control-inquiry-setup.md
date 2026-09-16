# 내부회계·내부통제 문의 접수 연결

브라우저 → 같은 사이트의 `/api/internal-control-inquiry` → 전용 Google Apps Script → Google Sheets 순서로 저장합니다. 기존 감사 문의의 Apps Script URL, `doPost`, 시트 구조는 사용하거나 변경하지 않습니다. **기존 프로젝트에 이 `doPost`를 덮어쓰지 말고 별도 수신 프로젝트로 설치하세요.**

## 1. 전용 수신 프로젝트 준비

1. 담당자가 접근 권한을 관리할 Google 스프레드시트를 준비하고 문서 ID를 확인합니다. 문서 자체를 공개할 필요는 없습니다.
2. 새 독립형 Apps Script 프로젝트를 만들고 `integrations/internal-control-inquiry.gs` 내용을 붙여 넣습니다.
3. 프로젝트 설정의 스크립트 속성에 `SHEET_ID`와 `INQUIRY_TOKEN`을 설정합니다. 토큰은 안전한 난수로 생성한 32~512자의 공백 없는 문자열이어야 합니다. HTML, Git, URL 쿼리에는 넣지 않습니다.
4. **배포 → 새 배포 → 웹 앱**에서 실행 주체를 소유자, 접근 권한을 로그인 없이 요청 가능한 **모든 사용자**로 설정합니다. 소유자는 시트 편집 권한과 Apps Script 실행 권한을 승인해야 합니다. 조직 정책이 익명 웹 앱을 금지하면 관리자와 다른 수신 방식을 정해야 합니다.
5. 배포된 `https://script.google.com/macros/s/<배포-ID>/exec` URL을 보관합니다. `/dev` 테스트 URL은 사용하지 않습니다. 코드를 고쳤다면 새 버전으로 웹 앱 배포를 갱신합니다.

이 방식과 실행 권한은 [Google 웹 앱 문서](https://developers.google.com/apps-script/guides/web), 속성 설정은 [Properties Service 문서](https://developers.google.com/apps-script/guides/properties)를 참고하세요.

## 2. Vercel 환경 변수 설정

| 서버 환경 변수 | 값 |
| --- | --- |
| `INTERNAL_CONTROL_INQUIRY_URL` | 위 전용 웹 앱의 `/exec` URL |
| `INTERNAL_CONTROL_INQUIRY_TOKEN` | Apps Script의 `INQUIRY_TOKEN`과 동일한 값 |

필요한 배포 환경(Preview / Production)에 각각 설정하고 재배포합니다. Preview에는 별도의 테스트용 수신 프로젝트와 시트를 권장합니다. 브라우저에 공개되는 접두사나 클라이언트 코드에 넣지 않습니다. `/api`의 함수는 외부 패키지를 사용하지 않는 Node.js 함수이며 `fetch`를 지원하는 Vercel Node.js 런타임을 사용합니다. 함수 실행 제한은 수신 응답 제한 12초보다 길게 설정합니다. [Vercel Node.js 문서](https://vercel.com/docs/functions/runtimes/node-js)

환경 변수가 없거나 형식이 맞지 않으면 GET은 `{ "available": false }`, POST는 HTTP 503을 반환합니다. GET의 `available`은 **환경 변수의 형식 확인 결과**이며 실제 시트 저장 성공이나 수신 서버 상태를 보증하지 않습니다.

## 3. 요청·응답 계약

브라우저는 같은 사이트의 API에 `Content-Type: application/json`으로 아래 필드를 보냅니다. 총 본문 제한은 UTF-8 기준 20 KiB입니다. 다른 출처의 요청, JSON 외 본문, 정의되지 않은 필드는 거절합니다.

| 필드 | 형식과 제한 |
| --- | --- |
| `companyName` | 필수 문자열, 최대 100자 |
| `contactName` | 필수 문자열, 최대 100자 |
| `email` | 선택 이메일 문자열, 최대 254자. `email`과 `phone` 중 하나 이상 필요 |
| `phone` | 선택 전화번호 문자열, 7~30자, 숫자 7개 이상; `+ ( ) . -`와 공백 허용. `email`과 `phone` 중 하나 이상 필요 |
| `employeeRange` | 선택 문자열. 빈 값, `1-9`, `10-29`, `30-99`, `100-299`, `300+`만 허용 |
| `industry` | 선택 업종·사업 설명 문자열, 최대 200자 |
| `controlStatus` | `new`, `review`, `operate`, `unsure` 중 하나 |
| `desiredSchedule` | 선택 문자열, 최대 100자 |
| `message` | 선택 문자열, 최대 3,000자 |
| `consent` | 필수, boolean `true` |
| `requestId` | 필수 UUID, 36자 |

문자열 앞뒤 공백은 제거합니다. 선택 문자열을 생략하면 빈 문자열로 저장합니다. 서버는 `{ token, payload }` 형태로 전용 Apps Script에 전달하며, HTTP 성공만으로 접수를 완료 처리하지 않습니다. JSON 응답의 `success === true`와 동일한 `requestId`가 모두 확인된 경우에만 브라우저에 HTTP 200과 `{ "success": true, "requestId": "…" }`를 반환합니다. [ContentService의 리디렉션](https://developers.google.com/apps-script/guides/content)을 따라 최종 JSON 응답을 확인합니다.

실패 응답은 `{ "success": false, "code": "…", "message": "…" }`입니다. HTTP 400은 입력 오류, 403은 출처 오류, 413은 본문 초과, 415는 본문 형식 오류, 503은 미설정입니다. 수신 오류·확인 불가 응답은 502, 25초 응답 제한은 504이며 두 경우 모두 `RECEIPT_UNCONFIRMED`입니다. 오류 시 개인정보나 수신 서버의 상세 응답을 반환·기록하지 않습니다.

응답이 끊겨도 저장은 완료됐을 수 있으므로 **동일한 내용의 재시도는 동일한 `requestId`를 유지**합니다. 내용을 변경하면 새 UUID를 생성합니다. 폼은 성공 전까지 입력 내용을 보존하며 브라우저 측 제한 시간은 서버의 25초보다 길게 둡니다(예: 35초). API가 명시적으로 확인하기 전에는 접수 완료를 표시하지 않습니다.

## 4. 저장 방식과 확인

첫 정상 요청에서 `InternalControlInquiries` 탭을 만들고 `receivedAt`, `requestId`, 회사명, 담당자, 이메일, 연락처, 직원 수 구간, 업종, 현재 상태, 희망 시기, 문의 내용, 동의, `payloadHash` 순서로 저장합니다. 기존 `employeeCount` 헤더를 쓰던 시트는 첫 새 접수 때 `employeeRange` 헤더로 갱신하며 기존 행은 보존합니다. 그 외 열 이름·순서는 임의로 바꾸지 마세요.

스크립트 잠금 안에서 UUID 중복을 확인하고 행을 추가한 뒤 `flush()`와 ID·해시 재조회가 성공해야 접수증을 반환합니다. 같은 UUID·같은 내용은 새 행 없이 기존 접수증을 반환하고, 같은 UUID에 다른 내용이 들어오면 거절합니다. 사용자 문자열은 아포스트로피를 붙여 텍스트로 저장하므로 수식으로 실행되지 않습니다. [Sheet.appendRow 동작](https://developers.google.com/apps-script/reference/spreadsheet/sheet), [Lock 문서](https://developers.google.com/apps-script/reference/lock/lock)

연결 검증은 담당자가 테스트 환경에서 가상 문의를 제출하고, 완료 메시지의 UUID와 시트 행이 일치하는지 확인합니다. 동일한 내용을 같은 UUID로 재시도해도 한 행만 남는지 확인하세요. 실제 연락처 대신 테스트 데이터를 사용하고 확인 후 해당 테스트 행을 삭제합니다. 저장소의 자동 테스트는 모든 외부 호출을 모의 처리하며 실제 시트에 제출하지 않습니다.

```sh
node --test tests/internal-control-inquiry.test.js
```

시트 권한과 보관·삭제 운영은 담당자가 관리합니다. 이 구현은 접수 저장만 수행하며 이메일 발송은 포함하지 않습니다. 동일 출처 검사는 브라우저의 교차 출처 제출을 막지만 자동화된 직접 호출의 스팸까지 차단하지는 않습니다.
