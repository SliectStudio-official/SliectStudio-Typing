import argparse
import json
import sys
import os
import re
import time
from urllib.parse import urlparse, urljoin

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

os.environ['PYTHONIOENCODING'] = 'utf-8'

try:
    import requests
    from bs4 import BeautifulSoup
    from requests.adapters import HTTPAdapter
    try:
        from urllib3.util.retry import Retry
    except ImportError:
        Retry = None
except ImportError:
    print(json.dumps({"error": "请先安装依赖: pip install requests beautifulsoup4"}, ensure_ascii=False))
    sys.exit(1)

try:
    import chardet
    HAS_CHARDET = True
except ImportError:
    HAS_CHARDET = False

try:
    import brotli
    HAS_BROTLI = True
except ImportError:
    HAS_BROTLI = False

# 现代浏览器请求头，降低被拦截概率
DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate' + (', br' if HAS_BROTLI else ''),
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    # 客户端提示头，进一步模拟真实浏览器
    'Sec-Ch-Ua': '"Chromium";v="124", "Not-A.Brand";v="99", "Google Chrome";v="124"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'DNT': '1',
    'Cache-Control': 'max-age=0',
}

# 移动端 UA，用于桌面 UA 被拦截时的重试
MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'


def build_session():
    """构建带重试机制的 requests Session"""
    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)
    if Retry:
        retry = Retry(
            total=2,
            backoff_factor=0.8,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=['GET', 'HEAD']
        )
        adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=10)
        session.mount('http://', adapter)
        session.mount('https://', adapter)
    return session


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
    session = build_session()
    # 提取根域名作为 Referer，降低反爬拦截概率
    try:
        parsed = urlparse(url)
        referer = '%s://%s' % (parsed.scheme, parsed.netloc) if parsed.scheme and parsed.netloc else url
    except Exception:
        referer = url

    last_err = None
    last_err_type = 'unknown'
    resp = None
    # 主请求 + 手动重试（4次：桌面UA → SSL降级 → 移动端UA → 移动端UA重试）
    for attempt in range(4):
        try:
            # 第 3、4 次尝试切换移动端 UA（部分站点对桌面 UA 反爬更严）
            use_mobile = attempt >= 2
            verify_ssl = attempt != 1  # 第 2 次（attempt==1）降级不验证证书
            headers = dict(DEFAULT_HEADERS)
            if use_mobile:
                headers['User-Agent'] = MOBILE_UA
                headers['Sec-Ch-Ua-Mobile'] = '?1'
                headers['Sec-Ch-Ua-Platform'] = '"iOS"'
            headers['Referer'] = referer
            resp = session.get(url, timeout=(8, 15), allow_redirects=True,
                               verify=verify_ssl, headers=headers)
            resp.raise_for_status()
            break
        except requests.exceptions.SSLError as e:
            last_err = '该网站证书验证失败' + ('，已尝试降级仍无法访问' if attempt >= 1 else '')
            last_err_type = 'ssl'
            continue
        except requests.exceptions.Timeout:
            last_err = '目标网站响应超时，请稍后重试或更换网址'
            last_err_type = 'timeout'
            continue
        except requests.exceptions.ConnectionError as e:
            last_err = '无法连接到目标网站，请检查网址是否正确'
            last_err_type = 'connection'
            time.sleep(1)
            continue
        except requests.exceptions.RequestException as e:
            # 403/401/404/410 等直接退出，重试无意义
            if hasattr(e, 'response') and e.response is not None and e.response.status_code in (401, 403):
                return {'error': '目标网站拒绝访问（HTTP %d，反爬机制），建议更换网址' % e.response.status_code, 'error_type': 'forbidden'}
            if hasattr(e, 'response') and e.response is not None and e.response.status_code in (404, 410):
                return {'error': '目标网页不存在或已删除（HTTP %d）' % e.response.status_code, 'error_type': 'not_found'}
            last_err = '请求失败：' + str(e)
            last_err_type = 'request'
            continue
    else:
        return {'error': last_err or '请求失败', 'error_type': last_err_type}

    try:
        text = decode_content(resp)
        soup = BeautifulSoup(text, 'html.parser')

        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'form', 'iframe', 'noscript']):
            tag.decompose()

        title = ''
        # 优先 og:title，再 h1，再 title
        og_title = soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            title = og_title['content'].strip()
        if not title and soup.find('h1'):
            title = soup.find('h1').get_text(strip=True)
        if not title and soup.find('title'):
            title = soup.find('title').get_text(strip=True)

        content_parts = []
        article_tag = (
            soup.find('article') or
            soup.find('div', class_=re.compile(r'article|content|post|entry|body|main', re.I)) or
            soup.find('main') or
            soup.find('div', id=re.compile(r'article|content|post|entry|body|main', re.I))
        )

        if article_tag:
            paragraphs = article_tag.find_all(['p', 'h2', 'h3', 'h4', 'blockquote', 'li'])
            for p in paragraphs:
                text_p = p.get_text(' ', strip=True)
                if text_p and len(text_p) > 5:
                    content_parts.append(text_p)

        if not content_parts:
            paragraphs = soup.find_all('p')
            for p in paragraphs:
                text_p = p.get_text(' ', strip=True)
                if text_p and len(text_p) > 10:
                    content_parts.append(text_p)

        # readability 启发式：若仍无内容，遍历所有 div，按 (p标签数*50 + 文本长度) 评分选最优块
        if not content_parts and soup.body:
            best_div = None
            best_score = 0
            for div in soup.body.find_all('div'):
                p_count = len(div.find_all('p'))
                div_text = div.get_text(' ', strip=True)
                text_len = len(div_text)
                score = p_count * 50 + text_len
                if score > best_score and text_len > 100:
                    best_score = score
                    best_div = div
            if best_div:
                paragraphs = best_div.find_all(['p', 'h2', 'h3', 'h4', 'blockquote', 'li'])
                for p in paragraphs:
                    text_p = p.get_text(' ', strip=True)
                    if text_p and len(text_p) > 5:
                        content_parts.append(text_p)
                # 若 div 内 p 不足，直接取 div 的分行文本
                if not content_parts:
                    for line in best_div.get_text('\n', strip=True).split('\n'):
                        line = line.strip()
                        if line and len(line) > 15:
                            content_parts.append(line)

        # 若仍无内容，尝试从 body 提取大段文本
        if not content_parts and soup.body:
            full_text = soup.body.get_text('\n', strip=True)
            for line in full_text.split('\n'):
                line = line.strip()
                if line and len(line) > 15:
                    content_parts.append(line)

        content = '\n'.join(content_parts)

        if not title:
            title = url.split('/')[-1] or '抓取文章'

        # 限制内容长度，避免过大文章
        if len(content) > 50000:
            content = content[:50000] + '\n...(内容已截断)'

        # 空内容检测：阈值 50 字符，过短说明可能为 SPA 或非文本内容
        if len(content.strip()) < 50:
            return {'error': '未能提取到有效正文，该网页可能需要 JavaScript 渲染或为图片/视频为主的内容', 'error_type': 'empty_content'}

        has_mojibake = bool(re.search(r'\ufffd{2,}', title + content))
        if has_mojibake:
            return {'title': title, 'content': content, 'warning': '文本可能存在编码问题，部分内容显示异常，请手动检查'}

        return {'title': title, 'content': content}
    except Exception as e:
        return {'error': '解析失败: ' + str(e), 'error_type': 'parse'}


def _build_search_urls(query_str):
    """构建多引擎搜索 URL 列表：Bing 国际、Bing 国内、DuckDuckGo HTML"""
    encoded = requests.utils.quote(query_str)
    return [
        ('bing_intl', 'https://www.bing.com/search?q=' + encoded + '&count=20&setlang=en-US'),
        ('bing_cn', 'https://cn.bing.com/search?q=' + encoded + '&count=20'),
        ('ddg', 'https://html.duckduckgo.com/html/?q=' + encoded),
    ]


def _parse_bing_results(soup, limit):
    """解析 Bing 搜索结果页（多组选择器增强容错）"""
    results = []
    items = soup.select('li.b_algo')
    if not items:
        items = soup.find_all('li', class_='b_algo')
    if not items:
        items = soup.find_all('li', attrs={'data-id': True})

    for item in items:
        if len(results) >= limit:
            break
        # 优先 h2 > a（Bing 新版结构），再任意 a[href]
        h2 = item.find('h2')
        if h2:
            link_tag = h2.find('a', href=True) or item.find('a', href=True)
        else:
            link_tag = item.find('a', href=True)
        if not link_tag:
            continue
        link = link_tag['href']
        title = link_tag.get_text(' ', strip=True)
        if not title or not link:
            continue
        # 跳过 Bing 内部跳转链接
        if link.startswith('javascript:') or 'bing.com' in link:
            continue
        snippet = ''
        p_tag = item.find('p') or item.find('div', class_=re.compile(r'b_caption|b_lineclamp', re.I))
        if p_tag:
            snippet = p_tag.get_text(' ', strip=True)
        results.append({'title': title, 'url': link, 'snippet': snippet[:200] if snippet else ''})
    return results


def _parse_ddg_results(soup, limit):
    """解析 DuckDuckGo HTML 搜索结果页"""
    results = []
    items = soup.select('.result') or soup.find_all('div', class_='result')
    for item in items:
        if len(results) >= limit:
            break
        link_tag = item.select_one('.result__a') or item.find('a', class_='result__a', href=True)
        if not link_tag:
            continue
        link = link_tag.get('href', '')
        title = link_tag.get_text(' ', strip=True)
        if not title or not link:
            continue
        # DuckDuckGo 的链接常为 //duckduckgo.com/l/?uddg=<编码URL> 形式，需解析真实 URL
        if 'uddg=' in link:
            try:
                from urllib.parse import parse_qs
                qs = parse_qs(urlparse(link).query)
                if 'uddg' in qs and qs['uddg']:
                    link = qs['uddg'][0]
            except Exception:
                pass
        if link.startswith('//'):
            link = 'https:' + link
        if link.startswith('javascript:') or 'duckduckgo.com' in link:
            continue
        snippet = ''
        snip_tag = (item.select_one('.result__snippet')
                    or item.find('a', class_='result__snippet')
                    or item.find('div', class_='result__snippet'))
        if snip_tag:
            snippet = snip_tag.get_text(' ', strip=True)
        results.append({'title': title, 'url': link, 'snippet': snippet[:200] if snippet else ''})
    return results


def _normalize_url(u):
    """规范化 URL 用于去重：取 hostname + path，忽略 query/fragment"""
    try:
        p = urlparse(u)
        return (p.netloc.lower().lstrip('www.'), p.path.rstrip('/'))
    except Exception:
        return (u, '')


def _dedup_results(results):
    """按 hostname+path 去重，保留首个出现的"""
    seen = set()
    deduped = []
    for r in results:
        key = _normalize_url(r.get('url', ''))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)
    return deduped


def _search_once(session, query_str, limit):
    """执行一次搜索（多引擎降级：Bing国际→Bing国内→DuckDuckGo），返回结果列表"""
    for engine, surl in _build_search_urls(query_str):
        try:
            resp = session.get(surl, timeout=(8, 15))
            resp.raise_for_status()
            text = decode_content(resp)
            soup = BeautifulSoup(text, 'html.parser')
            if engine == 'ddg':
                results = _parse_ddg_results(soup, limit)
            else:
                results = _parse_bing_results(soup, limit)
            if results:
                return results
        except Exception:
            continue
    return []


def search_articles(keyword, limit=10):
    """多关键词智能搜索：单关键词直接搜；多关键词先 AND，结果不足 5 条回退 OR"""
    keyword = keyword.strip()
    if not keyword:
        return {'error': '关键词不能为空'}

    kws = keyword.split()
    is_multi = len(kws) > 1
    session = build_session()

    # 单关键词：直接搜索
    if not is_multi:
        results = _search_once(session, keyword, limit)
        results = _dedup_results(results)
        if not results:
            return {'error': '未获取到搜索结果，请尝试更换关键词或稍后重试'}
        return {'keyword': keyword, 'mode': 'single', 'results': results[:limit]}

    # 多关键词：先 AND（空格连接，Bing/DDG 默认 AND 语义）
    and_query = ' '.join(kws)
    and_results = _dedup_results(_search_once(session, and_query, limit))

    if len(and_results) >= 5:
        return {'keyword': keyword, 'mode': 'AND', 'results': and_results[:limit]}

    # AND 不足 5 条，回退 OR 模式
    or_query = ' OR '.join(kws)
    or_results = _dedup_results(_search_once(session, or_query, limit))

    # 合并 AND + OR 结果并去重（AND 优先排序）
    merged = _dedup_results(and_results + or_results)
    if not merged:
        return {'error': '未获取到搜索结果，请尝试更换关键词或稍后重试'}

    return {'keyword': keyword, 'mode': 'OR', 'results': merged[:limit]}


def main():
    parser = argparse.ArgumentParser(description='文章爬虫')
    parser.add_argument('--url', help='目标URL')
    parser.add_argument('--keyword', help='搜索关键词（与 --url 二选一）')
    parser.add_argument('--search-limit', type=int, default=10, help='搜索结果数量上限')
    parser.add_argument('--category_id', type=int, default=0, help='分类ID')
    parser.add_argument('--db', default='', help='SQLite数据库路径')
    parser.add_argument('--db-config', default='', help='db-config.json路径（MySQL支持）')
    parser.add_argument('--preview', action='store_true', help='仅预览不入库')
    args = parser.parse_args()

    # 关键词搜索模式
    if args.keyword:
        result = search_articles(args.keyword, limit=args.search_limit)
        print(json.dumps(result, ensure_ascii=False))
        return

    if not args.url:
        print(json.dumps({"error": "请提供 --url 或 --keyword 参数"}, ensure_ascii=False))
        sys.exit(1)

    result = crawl_article(args.url)

    if 'error' in result:
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)

    if not result.get('content') or len(result['content']) < 20:
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
