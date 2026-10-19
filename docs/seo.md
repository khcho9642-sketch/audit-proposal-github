# Google Search SEO 운영

## 공개 페이지와 대표 주소

검색에 노출할 HTML 페이지는 `sitemap.xml`의 5개 주소다. 각 페이지의
canonical과 `og:url`은 이 주소와 같아야 한다. `/index.html`과 하위 페이지의
`index.html`, 끝의 `/`가 없는 디렉터리 주소는 `vercel.json`에서 대표 주소로
영구 리디렉션한다. API 경로에는 페이지 리디렉션을 적용하지 않는다.

홈페이지에는 `WebSite`, 담당 회계사의 `Person`, `WebPage`, `Service`를
연결했다. 안내 글에는 본문에 표시된 작성자와 내용에 대응하는 `Article`과
탐색경로를, 서비스 목록에는 `CollectionPage`를 사용한다. 확인되지 않은
경력·주소·평점이나 검색 순위·감사 결과 보장은 추가하지 않는다.

## 변경 시 검증

```sh
python tests/seo_check.py
node tests/internal-control-inquiry-ui.test.js
node tests/internal-control-inquiry.test.js
python tests/seo_check.py --base-url https://audit-proposal.intellic.co.kr
```

SEO 검사는 HTMLParser와 XML 파서로 제목·설명 중복, H1, canonical,
메타데이터, JSON-LD, 탐색경로, 모든 내부 링크의 대상과 앵커, 이미지·파일,
robots와 사이트맵을 확인한다. 운영 검사에서는 HTTP 응답과 영구 리디렉션,
실제 404도 확인한다. 인증 보호된 배포에서는 먼저 Vercel의 인증된 요청
기능으로 검증하고 공개 운영 도메인에서도 다시 실행한다.

PC·모바일에서 제목 줄바꿈, 가로 넘침, 새 FAQ, 기존 신청 폼을 별도로 확인한다.
문의 API는 GET 상태와 모의 테스트로 확인하며 SEO 검증 중 실제 신청을 만들지 않는다.
코드·설정·테스트·문서는 `.vercelignore`로 정적 배포에서 제외한다.

## Search Console

- 관리 계정: `khcho9642@gmail.com`
- 기존 속성: `sc-domain:intellic.co.kr` (회계감사 하위 도메인 포함)
- 사이트맵: `https://audit-proposal.intellic.co.kr/sitemap.xml`
- 2026-10-19 확인: 기존 사이트맵 상태 성공, 발견된 페이지 5개

본문을 실질적으로 변경한 페이지에만 `lastmod`를 갱신한다. 배포 후
Search Console의 URL 검사에서 홈페이지의 색인 상태와 Google 선택 대표
주소를 확인한다. 필요하면 실제 URL 테스트 후 색인 생성을 요청한다.
사이트맵 제출·색인 생성 요청 성공과 Google의 실제 색인·노출은 구분한다.
검색어별 노출·클릭 변화는 실적 보고서에서 배포 전후 기간을 비교한다.

참고:
- https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/appearance/site-names
