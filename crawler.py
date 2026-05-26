import argparse
import json
import sys
import os
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
    parser.add_argument('--db-config', default='', help='db-config.json路径（MySQL支持）')
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

    db_config_path = args.db_config
    if not db_config_path and os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'db-config.json')):
        db_config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'db-config.json')

    if db_config_path and os.path.exists(db_config_path):
        try:
            with open(db_config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            db_type = config.get('type', 'sqlite')

            if db_type == 'mysql':
                try:
                    import pymysql
                except ImportError:
                    try:
                        import mysql.connector as pymysql
                    except ImportError:
                        result['saved'] = False
                        result['db_error'] = '请安装 pymysql: pip install pymysql'
                        print(json.dumps(result, ensure_ascii=False))
                        return

                mysql_cfg = config.get('mysql', {})
                conn = pymysql.connect(
                    host=mysql_cfg.get('host', 'localhost'),
                    port=mysql_cfg.get('port', 3306),
                    user=mysql_cfg.get('user', 'root'),
                    password=mysql_cfg.get('password', ''),
                    database=mysql_cfg.get('database', 'typing'),
                    charset=mysql_cfg.get('charset', 'utf8mb4')
                )
                try:
                    c = conn.cursor()
                    c.execute('INSERT INTO articles (title, content, category_id, source) VALUES (%s, %s, %s, %s)',
                              (result['title'], result['content'], args.category_id, args.url))
                    conn.commit()
                    article_id = c.lastrowid
                    c.execute('SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id WHERE a.id = %s', (article_id,))
                    row = c.fetchone()
                    cols = [desc[0] for desc in c.description] if c.description else []
                    result['id'] = article_id
                    if row and cols:
                        cat_idx = cols.index('category_name') if 'category_name' in cols else -1
                        result['category_name'] = row[cat_idx] if cat_idx >= 0 else ''
                    result['saved'] = True
                finally:
                    conn.close()
            else:
                import sqlite3
                db_path = config.get('sqlite', {}).get('path', './data/typing.db')
                if not os.path.isabs(db_path):
                    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), db_path)
                conn = sqlite3.connect(db_path)
                try:
                    c = conn.cursor()
                    c.execute('INSERT INTO articles (title, content, category_id, source) VALUES (?, ?, ?, ?)',
                              (result['title'], result['content'], args.category_id, args.url))
                    conn.commit()
                    article_id = c.lastrowid
                    c.execute('SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id WHERE a.id = ?', (article_id,))
                    row = c.fetchone()
                    result['id'] = article_id
                    result['category_name'] = row[7] if row else ''
                    result['saved'] = True
                finally:
                    conn.close()
        except Exception as e:
            result['saved'] = False
            result['db_error'] = str(e)
    elif args.db and args.category_id:
        try:
            import sqlite3
            conn = sqlite3.connect(args.db)
            try:
                c = conn.cursor()
                c.execute('INSERT INTO articles (title, content, category_id, source) VALUES (?, ?, ?, ?)',
                          (result['title'], result['content'], args.category_id, args.url))
                conn.commit()
                article_id = c.lastrowid
                c.execute('SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id = c.id WHERE a.id = ?', (article_id,))
                row = c.fetchone()
                result['id'] = article_id
                result['category_name'] = row[7] if row else ''
                result['saved'] = True
            finally:
                conn.close()
        except Exception as e:
            result['saved'] = False
            result['db_error'] = str(e)

    print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    main()
