"""Check public-page SEO locally, or crawl a deployment with --base-url."""

import argparse
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import unquote, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://audit-proposal.intellic.co.kr"


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.ids = set()
        self.scripts = []
        self.current_script = None
        self.title = ""
        self.in_title = False
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if attrs.get("id"):
            assert attrs["id"] not in self.ids, f"Duplicate ID: {attrs['id']}"
            self.ids.add(attrs["id"])
        if tag == "title":
            self.in_title = True
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.current_script = ""

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag == "script" and self.current_script is not None:
            self.scripts.append(json.loads(self.current_script))
            self.current_script = None

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.current_script is not None:
            self.current_script += data

    def meta(self, key):
        values = [a.get("content", "") for t, a in self.tags
                  if t == "meta" and (a.get("name") == key or a.get("property") == key)]
        assert len(values) == 1 and values[0].strip(), f"Missing or duplicate meta: {key}"
        return values[0]


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check(base_url=None):
    def read(path):
        if base_url:
            with urlopen(Request(base_url.rstrip("/") + path,
                                 headers={"User-Agent": "Site-SEO-Verification/1.0"}), timeout=30) as res:
                assert res.status == 200, (path, res.status)
                assert urlsplit(res.url).path == path, f"Canonical path redirects: {path}"
                assert "noindex" not in res.headers.get("X-Robots-Tag", "").lower(), path
                return res.read()
        target = ROOT / path.lstrip("/")
        if path.endswith("/"):
            target /= "index.html"
        return target.read_bytes()

    sitemap = ElementTree.fromstring(read("/sitemap.xml"))
    urls = [el.text for el in sitemap.findall("{*}url/{*}loc")]
    assert len(urls) == len(set(urls)), "Duplicate sitemap URLs"
    assert all(url.startswith(ORIGIN + "/") for url in urls), "Wrong sitemap host"
    paths = [urlsplit(url).path for url in urls]
    expected = {"/" + str(p.parent.relative_to(ROOT)).replace("\\", "/").strip(".")
                for p in ROOT.rglob("index.html") if ".vercel" not in p.parts}
    expected = {p.rstrip("/") + "/" for p in expected}
    assert set(paths) == expected, f"Sitemap coverage: {set(paths) ^ expected}"
    robots_text = read("/robots.txt").decode("utf-8")
    assert f"Sitemap: {ORIGIN}/sitemap.xml" in robots_text
    robots = RobotFileParser()
    robots.parse(robots_text.splitlines())
    pages = {path: Page(read(path).decode("utf-8")) for path in paths}
    titles, descriptions, links, assets, graph_ids = set(), set(), [], set(), set()
    for path, page in pages.items():
        assert robots.can_fetch("Googlebot", ORIGIN + path), f"Blocked by robots: {path}"
        assert page.title.strip() and page.title not in titles, f"Title: {path}"
        titles.add(page.title)
        description = page.meta("description")
        assert description not in descriptions, f"Duplicate description: {path}"
        descriptions.add(description)
        assert len([t for t, _ in page.tags if t == "h1"]) == 1, f"H1: {path}"
        assert [a.get("href") for t, a in page.tags
                if t == "link" and a.get("rel") == "canonical"] == [ORIGIN + path], path
        assert page.meta("og:url") == ORIGIN + path, path
        assert page.meta("og:title") == page.title, path
        assert page.meta("og:site_name") == "조경호 회계사", path
        assert "noindex" not in page.meta("robots").lower(), path
        assert page.meta("twitter:card") == "summary_large_image", path
        assert page.meta("og:image").startswith(ORIGIN + "/"), path
        assets.add(urlsplit(page.meta("og:image")).path)
        assert page.meta("og:image:alt"), path
        assert page.scripts, f"Missing structured data: {path}"
        for script in page.scripts:
            assert script.get("@context") == "https://schema.org", path
            for node in script.get("@graph", [script]):
                assert node.get("@type"), path
                if node.get("@id"):
                    graph_ids.add(node["@id"])
                if node.get("@type") == "BreadcrumbList":
                    items = node["itemListElement"]
                    assert [v["position"] for v in items] == list(range(1, len(items) + 1)), path
                    assert items[-1]["item"] == ORIGIN + path, path
        for tag, attrs in page.tags:
            if tag == "html":
                assert attrs.get("lang") == "ko", path
            if tag == "a" and attrs.get("href"):
                links.append((path, urljoin(ORIGIN + path, attrs["href"])))
            if tag in ("img", "script", "link"):
                resource = attrs.get("src") if tag != "link" else attrs.get("href")
                if resource and resource.startswith("/"):
                    assets.add(urlsplit(resource).path)
            if tag == "img":
                assert attrs.get("alt") and attrs.get("width") and attrs.get("height"), path
        print(f"PASS {path}: title, H1, canonical, metadata, structured data")
    assert ORIGIN + "/#website" in graph_ids
    assert ORIGIN + "/#accountant" in graph_ids
    for source, link in links:
        url = urlsplit(link)
        if url.netloc != urlsplit(ORIGIN).netloc:
            continue
        if url.path in pages:
            assert not url.fragment or unquote(url.fragment) in pages[url.path].ids, (source, link)
        else:
            assert Path(url.path).suffix, f"Unlisted internal page: {link}"
            assets.add(url.path)
    for path in sorted(assets):
        assert read(path), f"Empty asset: {path}"
    if base_url:
        opener = build_opener(NoRedirect)
        redirects = json.loads((ROOT / "vercel.json").read_text())["redirects"]
        for rule in redirects:
            try:
                opener.open(base_url.rstrip("/") + rule["source"], timeout=30)
                raise AssertionError(f"Missing redirect: {rule['source']}")
            except HTTPError as error:
                assert error.code in (301, 308), (rule["source"], error.code)
                location = urlsplit(urljoin(base_url, error.headers["Location"]))
                assert location.path == rule["destination"], (rule, location.path)
        try:
            urlopen(base_url.rstrip("/") + "/seo-not-a-real-page", timeout=30)
            raise AssertionError("Unknown page returned success (soft 404)")
        except HTTPError as error:
            assert error.code == 404, error.code
        print(f"PASS {len(redirects)} permanent redirects and true 404")
    print(f"PASS {len(pages)} pages, {len(links)} internal/external links, {len(assets)} local assets; robots and sitemap")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", help="Check the live deployment instead of local files")
    check(parser.parse_args().base_url)
