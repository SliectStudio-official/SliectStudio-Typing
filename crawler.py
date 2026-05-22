import argparse
import json
import sys
import os
import sqlite3
import re

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

os.environ['PYTHONIOENCODING'] = 'utf-8'

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print(json.dumps({"error": "请先安装依赖: pip install requests beautifulsoup4"}, ensure_ascii=False))
    sys.exit(1)

try:
    import chardet
    HAS_CHARDET = True
except ImportError:
    HAS_CHARDET = False


def detect_encoding_from_content(raw_bytes):
    if raw_bytes.startswith(b'\xef\xbb\xbf'):
        return 'utf-8-sig'
    if raw_bytes.startswith(b'\xff\xfe'):
        return 'utf-16-le'
    if raw_bytes.startswith(b'\xfe\xff'):
        return 'utf-16-be'

    try:
        raw_bytes.decode('utf-8')
        return 'utf-8'
    except UnicodeDecodeError:
        pass

    if HAS_CHARDET:
        det = chardet.detect(raw_bytes[:16384])
        if det and det.get('encoding') and det.get('confidence', 0) > 0.6:
            enc = det['encoding'].lower()
            if enc in ('gb2312', 'gbk', 'gb18030'):
                return 'gb18030'
            return enc

    for enc in ['gb18030', 'big5', 'euc-kr', 'euc-jp', 'shift_jis', 'latin1']:
        try:
            raw_bytes.decode(enc)
            return enc
        except (UnicodeDecodeError, LookupError):
            continue

    return 'utf-8'


def detect_encoding_from_html(raw_bytes, fallback):
    try:
        head = raw_bytes[:4096]
        head_text = head.decode('ascii', errors='ignore').lower()

        match = re.search(r'<meta[^>]+charset=["\']?([^"\';\s>]+)', head_text)
        if not match:
            match = re.search(r'charset=["\']?([^"\';\s>]+)', head_text)
        if match:
            declared = match.group(1).strip().lower()
            if declared in ('gb2312', 'gbk'):
                declared = 'gb18030'
            try:
                ''.encode(declared)
                return declared
            except (LookupError, UnicodeError):
                pass
    except Exception:
        pass

    return fallback


def decode_content(resp):
    raw = resp.content

    http_encoding = None
    content_type = resp.headers.get('Content-Type', '')
    if 'charset=' in content_type:
        match = re.search(r'charset=([^\s;]+)', content_type, re.I)
        if match:
            http_encoding = match.group(1).strip().strip('"').strip("'").lower()
            if http_encoding in ('gb2312', 'gbk'):
                http_encoding = 'gb18030'

    content_encoding = detect_encoding_from_content(raw[:16384])
    html_encoding = detect_encoding_from_html(raw, content_encoding)

    encoding = html_encoding
    if http_encoding:
        try:
            test_text = raw.decode(http_encoding, errors='strict')
            if not re.search(r'[\ufffd]{3,}', test_text[:2000]):
                encoding = http_encoding
        except (UnicodeDecodeError, LookupError):
            pass

    try:
        text = raw.decode(encoding, errors='replace')
    except (LookupError, UnicodeError):
        text = raw.decode('utf-8', errors='replace')

    return text


def crawl_article(url):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
        }
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()

        text = decode_content(resp)
        soup = BeautifulSoup(text, 'html.parser')

        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
            tag.decompose()

        title = ''
        if soup.find('h1'):
            title = soup.find('h1').get_text(strip=True)
        elif soup.find('title'):
            title = soup.find('title').get_text(strip=True)

        content_parts = []
        article_tag = (
            soup.find('article') or
            soup.find('div', class_=re.compile(r'article|content|post|entry|body', re.I)) or
            soup.find('main') or
            soup.find('div', id=re.compile(r'article|content|post|entry|body', re.I))
        )

        if article_tag:
            paragraphs = article_tag.find_all(['p', 'h2', 'h3', 'h4', 'blockquote'])
            for p in paragraphs:
                text_p = p.get_text(strip=True)
                if text_p and len(text_p) > 5:
                    content_parts.append(text_p)

        if not content_parts:
            paragraphs = soup.find_all('p')
            for p in paragraphs:
                text_p = p.get_text(strip=True)
                if text_p and len(text_p) > 10:
                    content_parts.append(text_p)

        content = '\n'.join(content_parts)

        if not title:
            title = url.split('/')[-1] or '抓取文章'

        has_mojibake = bool(re.search(r'\ufffd{2,}', title + content))
        if has_mojibake:
            return {'title': title, 'content': content, 'warning': '文本可能存在编码问题，部分内容显示异常，请手动检查'}

        return {'title': title, 'content': content}
    except requests.exceptions.RequestException as e:
        return {'error': '网络请求失败: ' + str(e)}
    except Exception as e:
        return {'error': str(e)}

def main():
    parser = argparse.ArgumentParser(description='文章爬虫')
    parser.add_argument('--url', required=True, help='目标URL')
    parser.add_argument('--category_id', type=int, default=0, help='分类ID')
    parser.add_argument('--db', default='', help='SQLite数据库路径')
    parser.add_argument('--preview', action='store_true', help='仅预览不入库')
    args = parser.parse_args()

    result = crawl_article(args.url)

    if 'error' in result:
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)

    if not result['content'] or len(result['content']) < 20:
        print(json.dumps({"error": "未能提取到有效内容"}, ensure_ascii=False))
        sys.exit(1)

    if args.preview:
        print(json.dumps(result, ensure_ascii=False))
        return

    if args.db and args.category_id:
        try:
            conn = sqlite3.connect(args.db)
            c = conn.cursor()
            c.execute('INSERT INTO articles (title, content, category_id, source) VALUES (?, ?, ?, ?)',
                      (result['title'], result['content'], args.category_id, args.url))
            conn.commit()
            article_id = c.lastrowid
            c.execute('SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id WHERE a.id = ?', (article_id,))
            row = c.fetchone()
            conn.close()
            result['id'] = article_id
            result['category_name'] = row[7] if row else ''
            result['saved'] = True
        except Exception as e:
            result['saved'] = False
            result['db_error'] = str(e)

    print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    main()
