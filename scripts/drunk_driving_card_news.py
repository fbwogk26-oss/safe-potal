"""
음주운전 예방 카드뉴스 자동화 시스템
- 뉴스 수집: 네이버 API → 구글 RSS → Claude fallback
- 카드뉴스 생성: Claude API + Pillow
- 발송: Gmail SMTP
"""

import os
import re
import time
import smtplib
import logging
import textwrap
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from io import BytesIO
from pathlib import Path

import requests
import feedparser
import anthropic
from PIL import Image, ImageDraw, ImageFont

# ────────────────────────────────────────────────────────────────────────────
# 로깅 설정
# ────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────────────────
# 환경 설정
# ────────────────────────────────────────────────────────────────────────────
NAVER_CLIENT_ID     = os.getenv("NAVER_CLIENT_ID", "")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET", "")
ANTHROPIC_API_KEY   = os.getenv("ANTHROPIC_API_KEY", "")
GMAIL_APP_PASSWORD  = os.getenv("GMAIL_APP_PASSWORD", "")
GMAIL_SENDER        = os.getenv("GMAIL_SENDER", "")
GMAIL_RECIPIENTS    = [r.strip() for r in os.getenv("GMAIL_RECIPIENTS", GMAIL_SENDER).split(",") if r.strip()]

GOOGLE_RSS_URL = "https://news.google.com/rss/search?q=음주운전&hl=ko&gl=KR&ceid=KR:ko"
KEYWORDS       = ["음주운전", "음주사고", "음주측정", "음주단속"]
MAX_NEWS       = 6
LINK_TIMEOUT   = 5   # 초
RETRY_COUNT    = 3
RETRY_INTERVAL = 2   # 초

# 폰트 경로 (스크립트와 같은 폴더에 NotoSansKR-Regular.otf 또는 .ttf)
_SCRIPT_DIR = Path(__file__).parent
FONT_PATH = str(next(
    (p for p in [
        _SCRIPT_DIR / "NotoSansKR-Regular.otf",
        _SCRIPT_DIR / "NotoSansKR-Regular.ttf",
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ] if p.exists()),
    None
))


# ============================================================================
# 1. 유틸 함수
# ============================================================================

def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


def _retry(fn, label: str):
    """최대 RETRY_COUNT회 재시도, 실패 시 빈 리스트 반환."""
    for attempt in range(1, RETRY_COUNT + 1):
        try:
            result = fn()
            if result:
                log.info(f"[{label}] 성공 (시도 {attempt}/{RETRY_COUNT})")
                return result
            log.warning(f"[{label}] 결과 없음 (시도 {attempt}/{RETRY_COUNT})")
        except Exception as e:
            log.warning(f"[{label}] 오류 (시도 {attempt}/{RETRY_COUNT}): {e}")
        if attempt < RETRY_COUNT:
            time.sleep(RETRY_INTERVAL)
    log.error(f"[{label}] {RETRY_COUNT}회 모두 실패")
    return []


# ============================================================================
# 2. 링크 유효성 검증
# ============================================================================

def validate_link(url: str) -> bool:
    """
    requests.head() → 실패 시 requests.get()으로 HTTP 200 여부 확인.
    timeout=5초, URL 없는 항목은 True 처리.
    """
    if not url:
        return True
    _headers = {"User-Agent": "Mozilla/5.0 (compatible; CardNewsBot/1.0)"}
    try:
        resp = requests.head(url, timeout=LINK_TIMEOUT, allow_redirects=True, headers=_headers)
        if resp.status_code == 200:
            return True
        if resp.status_code in (405, 403, 301, 302):
            resp = requests.get(url, timeout=LINK_TIMEOUT, allow_redirects=True,
                                headers=_headers, stream=True)
            resp.close()
            return resp.status_code == 200
        return False
    except Exception as e:
        log.debug(f"링크 검증 실패 [{url[:60]}]: {e}")
        return False


# ============================================================================
# 3. 뉴스 수집 함수
# ============================================================================

def _fetch_naver() -> list[dict]:
    """네이버 뉴스 검색 API (NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 필요)."""
    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
        log.info("[네이버] API 키 미설정 → 건너뜀")
        return []

    def _call():
        resp = requests.get(
            "https://openapi.naver.com/v1/search/news.json",
            params={"query": "음주운전", "display": 20, "sort": "date"},
            headers={
                "X-Naver-Client-Id": NAVER_CLIENT_ID,
                "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
            },
            timeout=10,
        )
        resp.raise_for_status()
        items = []
        for i in resp.json().get("items", []):
            # pubDate 예: "Mon, 03 Jun 2024 14:30:00 +0900"
            pub_dt = None
            try:
                from email.utils import parsedate_to_datetime
                pub_dt = parsedate_to_datetime(i.get("pubDate", "")).astimezone(timezone.utc)
            except Exception:
                pass
            items.append({
                "title":        _strip_html(i.get("title", "")),
                "url":          i.get("originallink") or i.get("link", ""),
                "summary":      _strip_html(i.get("description", "")),
                "published_dt": pub_dt,
                "source":       "네이버 뉴스",
            })
        return items

    return _retry(_call, "네이버 뉴스")


def _fetch_google_rss() -> list[dict]:
    """구글 뉴스 RSS."""
    def _call():
        feed = feedparser.parse(GOOGLE_RSS_URL)
        if not feed.entries:
            raise ValueError("RSS 항목 없음")
        items = []
        for entry in feed.entries:
            pub_dt = None
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                pub_dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
            items.append({
                "title":        _strip_html(entry.get("title", "")),
                "url":          entry.get("link", ""),
                "summary":      _strip_html(entry.get("summary", "")),
                "published_dt": pub_dt,
                "source":       "구글 뉴스",
            })
        return items

    return _retry(_call, "구글 RSS")


def _fetch_claude_fallback() -> list[dict]:
    """네이버·구글 모두 실패 시 Claude가 직접 메시지 생성."""
    log.info("[Claude Fallback] 자체 메시지 생성 시작")
    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": (
                    "음주운전 예방을 위한 카드뉴스용 메시지 6개를 생성해줘. "
                    "각 항목은 최신 통계, 처벌 강화, 캠페인, 사고 사례 중 하나를 담아야 해. "
                    "아래 형식을 정확히 지켜줘:\n\n"
                    "[제목] 제목 텍스트\n"
                    "[내용] 2~3문장 내용\n"
                    "---\n\n"
                    "6개를 연속으로 출력해."
                ),
            }],
        )
        text = msg.content[0].text
        items = []
        for block in text.split("---"):
            block = block.strip()
            if not block:
                continue
            title = next((l.replace("[제목]", "").strip()
                          for l in block.splitlines() if l.startswith("[제목]")), "")
            summary = next((l.replace("[내용]", "").strip()
                            for l in block.splitlines() if l.startswith("[내용]")), "")
            if title:
                items.append({
                    "title":        title,
                    "url":          "",
                    "summary":      summary,
                    "published_dt": datetime.now(timezone.utc),
                    "source":       "Claude AI",
                })
        log.info(f"[Claude Fallback] {len(items)}개 메시지 생성 완료")
        return items
    except Exception as e:
        log.error(f"[Claude Fallback] 실패: {e}")
        return []


def _filter_news(items: list[dict]) -> list[dict]:
    """키워드 포함 여부 + 24/72시간 + 중복 제목 제거."""
    now = datetime.now(timezone.utc)

    def has_keyword(item):
        text = (item.get("title", "") + " " + item.get("summary", ""))
        return any(k in text for k in KEYWORDS)

    items = [i for i in items if has_keyword(i)]

    # 24h 우선, 없으면 72h, 그래도 없으면 전체
    cutoff = now - timedelta(hours=24)
    fresh = [i for i in items if i.get("published_dt") and i["published_dt"] >= cutoff]
    if not fresh:
        log.info("[필터] 24h 기사 없음 → 72h 확장")
        cutoff = now - timedelta(hours=72)
        fresh = [i for i in items if i.get("published_dt") and i["published_dt"] >= cutoff]
    if not fresh:
        log.info("[필터] 72h 기사도 없음 → 전체 사용")
        fresh = items

    # 중복 제목 제거 (앞 30자 기준)
    seen, unique = set(), []
    for i in fresh:
        key = i.get("title", "")[:30]
        if key not in seen:
            seen.add(key)
            unique.append(i)

    return unique


def get_news() -> list[dict]:
    """
    메인 뉴스 수집.
    1) 네이버 API  →  2) 구글 RSS  →  3) Claude fallback
    링크 유효성 검증 후 MAX_NEWS개 반환.
    """
    pool: list[dict] = []

    try:
        naver = _fetch_naver()
        if naver:
            pool.extend(naver)
            log.info(f"[수집] 네이버 {len(naver)}개")
        else:
            log.warning("[수집] 네이버 실패 → 구글 RSS fallback")

        if len(pool) < MAX_NEWS:
            google = _fetch_google_rss()
            if google:
                pool.extend(google)
                log.info(f"[수집] 구글 RSS {len(google)}개 (누적 {len(pool)}개)")
            else:
                log.warning("[수집] 구글 RSS 실패")

        if pool:
            filtered = _filter_news(pool)
            log.info(f"[필터] {len(pool)}개 → {len(filtered)}개")
        else:
            filtered = []

        # 링크 유효성 검증
        valid = []
        for item in filtered:
            if validate_link(item["url"]):
                valid.append(item)
            else:
                log.info(f"[링크검증] 제외: {item['title'][:40]}")
        log.info(f"[링크검증] 유효 기사: {len(valid)}개")

        if len(valid) < 1:
            log.warning("[수집] 유효 뉴스 없음 → Claude fallback")
            valid = _fetch_claude_fallback()

    except Exception as e:
        log.error(f"[get_news] 예외 발생: {e} → Claude fallback")
        valid = _fetch_claude_fallback()

    result = valid[:MAX_NEWS]
    log.info(f"[get_news] 최종 {len(result)}개 기사 반환")
    return result


# ============================================================================
# 4. 카드뉴스 이미지 생성 (Pillow + Claude)
# ============================================================================

_CARD_W, _CARD_H = 1080, 600
_BG_TOP    = (10, 25, 60)    # 짙은 남색
_BG_BOTTOM = (20, 50, 100)   # 중간 남색
_ACCENT    = (255, 80, 80)   # 빨간 강조
_WHITE     = (255, 255, 255)
_LIGHT     = (180, 210, 255)


def _get_font(size: int) -> ImageFont.FreeTypeFont:
    if FONT_PATH:
        try:
            return ImageFont.truetype(FONT_PATH, size)
        except Exception:
            pass
    return ImageFont.load_default()


def _draw_gradient_bg(draw: ImageDraw.ImageDraw):
    for y in range(_CARD_H):
        t = y / _CARD_H
        r = int(_BG_TOP[0] + (_BG_BOTTOM[0] - _BG_TOP[0]) * t)
        g = int(_BG_TOP[1] + (_BG_BOTTOM[1] - _BG_TOP[1]) * t)
        b = int(_BG_TOP[2] + (_BG_BOTTOM[2] - _BG_TOP[2]) * t)
        draw.line([(0, y), (_CARD_W, y)], fill=(r, g, b))


def _wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """픽셀 너비 기준 줄바꿈."""
    words = list(text)          # 한글은 글자 단위
    lines, line = [], ""
    for ch in text:
        test = line + ch
        # bbox 사용
        try:
            w = font.getlength(test)
        except Exception:
            w = len(test) * (font.size if hasattr(font, "size") else 12)
        if w > max_width and line:
            lines.append(line)
            line = ch
        else:
            line = test
    if line:
        lines.append(line)
    return lines


def generate_card_image(news_item: dict, index: int, total: int, card_text: str) -> bytes:
    """
    카드뉴스 1장 이미지 생성.
    card_text: Claude가 생성한 카드뉴스 텍스트 (제목/본문 포함).
    반환: PNG bytes
    """
    img = Image.new("RGB", (_CARD_W, _CARD_H))
    draw = ImageDraw.Draw(img)
    _draw_gradient_bg(draw)

    # 좌측 강조 바
    draw.rectangle([(0, 0), (8, _CARD_H)], fill=_ACCENT)

    # 상단 태그
    tag_font = _get_font(22)
    tag_text = "🚫 음주운전 ZERO 캠페인"
    draw.text((36, 30), tag_text, font=tag_font, fill=_ACCENT)

    # 페이지 번호 (우상단)
    page_font = _get_font(20)
    page_text = f"{index + 1} / {total}"
    try:
        pw = tag_font.getlength(page_text)
    except Exception:
        pw = len(page_text) * 12
    draw.text((_CARD_W - pw - 36, 30), page_text, font=page_font, fill=_LIGHT)

    # 구분선
    draw.rectangle([(36, 72), (_CARD_W - 36, 74)], fill=_ACCENT)

    # 카드 텍스트 파싱 (제목/본문 분리)
    lines_raw = [l.strip() for l in card_text.strip().splitlines() if l.strip()]
    headline = lines_raw[0] if lines_raw else news_item.get("title", "")
    body_lines = lines_raw[1:] if len(lines_raw) > 1 else [news_item.get("summary", "")]

    # 제목
    title_font = _get_font(36)
    wrapped_title = _wrap_text(headline, title_font, _CARD_W - 80)
    y = 96
    for line in wrapped_title[:3]:
        draw.text((36, y), line, font=title_font, fill=_WHITE)
        y += 46

    # 본문
    body_font = _get_font(26)
    y += 12
    for raw_line in body_lines[:6]:
        for wrapped in _wrap_text(raw_line, body_font, _CARD_W - 80):
            if y > _CARD_H - 110:
                break
            draw.text((36, y), wrapped, font=body_font, fill=_LIGHT)
            y += 36

    # 하단 바
    draw.rectangle([(0, _CARD_H - 64), (_CARD_W, _CARD_H)], fill=(5, 15, 40))
    footer_font = _get_font(20)
    source = news_item.get("source", "")
    pub_dt = news_item.get("published_dt")
    date_str = pub_dt.strftime("%Y.%m.%d") if pub_dt else ""
    footer = f"출처: {source}  {date_str}".strip()
    draw.text((36, _CARD_H - 44), footer, font=footer_font, fill=_LIGHT)

    url = news_item.get("url", "")
    if url:
        try:
            uw = footer_font.getlength(url[:60])
        except Exception:
            uw = len(url[:60]) * 11
        draw.text((_CARD_W - min(uw, 700) - 36, _CARD_H - 44),
                  url[:60], font=footer_font, fill=(120, 160, 220))

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def generate_card_texts(news_list: list[dict]) -> list[str]:
    """Claude API로 각 뉴스에 맞는 카드뉴스 텍스트 생성."""
    log.info("[카드뉴스] Claude API로 텍스트 생성 중...")
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    news_summary = "\n".join(
        f"{i+1}. 제목: {item['title']}\n   내용: {item.get('summary','')[:100]}"
        for i, item in enumerate(news_list)
    )
    msg = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=3000,
        messages=[{
            "role": "user",
            "content": (
                f"다음 음주운전 관련 뉴스 {len(news_list)}개를 카드뉴스 이미지용 텍스트로 변환해줘.\n\n"
                f"{news_summary}\n\n"
                "각 카드는 다음 형식으로, '===' 구분자로 구분해:\n"
                "첫 줄: 임팩트 있는 짧은 제목 (20자 이내)\n"
                "둘째 줄~: 핵심 내용 2~4줄 (각 줄 30자 이내, 불렛 없이 자연스러운 문장)\n"
                "마지막 줄: 예방 메시지 한 줄\n"
                "===\n"
                f"총 {len(news_list)}개를 순서대로 출력해."
            ),
        }],
    )
    text = msg.content[0].text
    cards = [c.strip() for c in text.split("===") if c.strip()]
    # 부족하면 원본 제목/요약으로 채우기
    while len(cards) < len(news_list):
        i = len(cards)
        cards.append(f"{news_list[i]['title']}\n{news_list[i].get('summary','')}")
    log.info(f"[카드뉴스] {len(cards)}개 텍스트 생성 완료")
    return cards[:len(news_list)]


# ============================================================================
# 5. 이메일 발송
# ============================================================================

def send_email(images: list[bytes], news_list: list[dict]):
    """Gmail SMTP로 카드뉴스 이미지 이메일 발송."""
    if not GMAIL_SENDER or not GMAIL_APP_PASSWORD or not GMAIL_RECIPIENTS:
        log.error("[이메일] 발신자/수신자/앱 비밀번호 미설정")
        return

    today = datetime.now().strftime("%Y년 %m월 %d일")
    subject = f"[음주운전 예방] {today} 카드뉴스 {len(images)}건"

    msg = MIMEMultipart("related")
    msg["Subject"] = subject
    msg["From"]    = GMAIL_SENDER
    msg["To"]      = ", ".join(GMAIL_RECIPIENTS)

    # HTML 본문
    html_imgs = "".join(
        f'<p><img src="cid:card{i}" style="max-width:100%;border-radius:8px;" /></p>'
        for i in range(len(images))
    )
    html_news = "".join(
        f'<li><a href="{item.get("url","#")}">{item["title"]}</a> '
        f'<small>({item.get("source","")})</small></li>'
        for item in news_list
    )
    html_body = f"""
    <html><body style="font-family:sans-serif;background:#f5f5f5;padding:20px;">
      <div style="max-width:800px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:#0a1940;padding:24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;">🚫 음주운전 예방 카드뉴스</h1>
          <p style="color:#aac;margin:8px 0 0;">{today}</p>
        </div>
        <div style="padding:24px;">{html_imgs}</div>
        <div style="padding:0 24px 24px;">
          <h3 style="color:#333;">📰 참고 기사</h3>
          <ul style="color:#555;line-height:2;">{html_news}</ul>
        </div>
      </div>
    </body></html>
    """
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    for i, img_bytes in enumerate(images):
        img_part = MIMEImage(img_bytes, _subtype="png")
        img_part.add_header("Content-ID", f"<card{i}>")
        img_part.add_header("Content-Disposition", "inline", filename=f"card_{i+1:02d}.png")
        msg.attach(img_part)

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_SENDER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_SENDER, GMAIL_RECIPIENTS, msg.as_bytes())
        log.info(f"[이메일] 발송 완료 → {GMAIL_RECIPIENTS}")
    except Exception as e:
        log.error(f"[이메일] 발송 실패: {e}")
        raise


# ============================================================================
# 6. 메인 실행
# ============================================================================

def main():
    log.info("=" * 60)
    log.info("음주운전 예방 카드뉴스 자동화 시작")
    log.info("=" * 60)

    # ── 뉴스 수집 ──────────────────────────────────────────────
    try:
        news_list = get_news()
    except Exception as e:
        log.error(f"뉴스 수집 예외: {e}")
        news_list = []

    if not news_list:
        log.warning("수집된 뉴스 없음. Claude fallback으로 진행")
        news_list = _fetch_claude_fallback()

    if not news_list:
        log.error("모든 수집 방법 실패. 종료")
        return

    log.info(f"사용할 뉴스: {len(news_list)}건")
    for i, n in enumerate(news_list, 1):
        log.info(f"  [{i}] {n['title'][:50]} ({n['source']})")

    # ── 카드뉴스 텍스트 생성 (Claude) ─────────────────────────
    try:
        card_texts = generate_card_texts(news_list)
    except Exception as e:
        log.error(f"카드 텍스트 생성 실패: {e} → 원본 제목 사용")
        card_texts = [
            f"{item['title']}\n{item.get('summary', '')}"
            for item in news_list
        ]

    # ── 이미지 생성 (Pillow) ───────────────────────────────────
    images: list[bytes] = []
    for i, (item, card_text) in enumerate(zip(news_list, card_texts)):
        try:
            img_bytes = generate_card_image(item, i, len(news_list), card_text)
            images.append(img_bytes)
            log.info(f"[이미지] {i+1}/{len(news_list)} 생성 완료")
        except Exception as e:
            log.error(f"[이미지] {i+1} 생성 실패: {e}")

    if not images:
        log.error("생성된 이미지 없음. 종료")
        return

    # ── 이메일 발송 ────────────────────────────────────────────
    try:
        send_email(images, news_list)
    except Exception as e:
        log.error(f"이메일 발송 실패: {e}")

    log.info("=" * 60)
    log.info(f"완료: 카드뉴스 {len(images)}장 생성, 발송 처리")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
