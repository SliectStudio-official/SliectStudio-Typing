/* 打字输入引擎（与首页同一套交互与样式）
 * 首页 script.js 里的分段/逐字判定逻辑被复制到这里，供比赛页复用；
 * 目的：用户在首页练出来的手感（按行分段、输完自动翻页、错字标红、IME 兼容）
 * 在比赛页完全一致。样式全部使用既有的 .typing-page / .typing-line-text / .typing-line-input。
 * 后续若要彻底消除重复，可把首页也切到本模块——那是单独一批，需回归全部打字用例。
 */
(function (global) {
  'use strict';

  var MAX_LINE = 32;
  var MIN_RATIO = 0.6;
  var SENTENCE_ENDS = '。！？…．；.!?';
  var COMMA_ENDS = '，、；：,;:';
  var CLOSING = '，。！？、；：）】》”’」』〕〉,.;:!?)]}';
  var OPENING = '（【《“‘「『〔〈([{-–—';
  var WORD_CHAR = /[A-Za-z0-9_’'\-]/;
  var COMBINING = /\p{M}/u;

  function isSpace(ch) { return ch === ' ' || ch === '\t' || ch === '\u00a0'; }
  function trimRight(s) { return s.replace(/[ \t\u00a0]+$/, ''); }
  function codePointAdvance(text, i) {
    if (i >= text.length) return text.length;
    var c = text.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length) return i + 2;
    return i + 1;
  }
  function safeCut(text, cut, start) {
    if (cut < start) cut = start;
    if (cut > text.length) cut = text.length;
    // 不要切在代理对中间
    if (cut > start && cut < text.length) {
      var c = text.charCodeAt(cut);
      if (c >= 0xDC00 && c <= 0xDFFF) cut++;
    }
    // 组合字符跟着基字符走
    while (cut < text.length && COMBINING.test(text[cut])) cut++;
    return cut;
  }
  function consumeSpaces(text, i) {
    while (i < text.length && isSpace(text[i])) i++;
    return i;
  }
  function isValidCut(text, start, cut, segment) {
    if (cut <= start || !segment) return false;
    var prev = segment.charAt(segment.length - 1);
    if (OPENING.indexOf(prev) >= 0) return false;
    var next = text.slice(cut).replace(/^[ \t\u00a0]+/, '').charAt(0);
    if (next && CLOSING.indexOf(next) >= 0) return false;
    return true;
  }

  function splitTextIntoSegments(text, maxLen) {
    var max = Math.max(4, parseInt(maxLen, 10) || MAX_LINE);
    var minLen = Math.ceil(max * MIN_RATIO);
    var blocks = String(text == null ? '' : text).split(/\r?\n/);
    var result = [];

    function splitBlock(block) {
      var segs = [];
      var start = 0;
      function tailOk(cut) {
        var rest = block.length - cut;
        return rest === 0 || rest >= minLen;
      }
      while (start < block.length) {
        var remaining = block.length - start;
        if (remaining <= max || remaining < minLen * 2) {
          var tail = trimRight(block.slice(start));
          if (tail) segs.push({ text: tail, start: start });
          break;
        }

        var cut = null;

        // a. 句末标点：断在标点之后，其后空白一并 trim 掉
        for (var i = Math.min(block.length - 1, start + max - 1); i >= start + minLen - 1; i--) {
          if (SENTENCE_ENDS.indexOf(block[i]) >= 0) {
            var next = i + 1;
            if (next >= block.length || isSpace(block[next])) {
              var c = safeCut(block, consumeSpaces(block, i + 1), start);
              var seg = trimRight(block.slice(start, c));
              if (seg.length >= minLen && seg.length <= max && tailOk(c) && isValidCut(block, start, c, seg)) {
                cut = c;
                break;
              }
            }
          }
        }

        // b. 逗号类
        if (cut === null) {
          for (var j = Math.min(block.length - 1, start + max - 1); j >= start + minLen - 1; j--) {
            if (COMMA_ENDS.indexOf(block[j]) >= 0) {
              var c2 = safeCut(block, consumeSpaces(block, j + 1), start);
              var seg2 = trimRight(block.slice(start, c2));
              if (seg2.length >= minLen && seg2.length <= max && tailOk(c2) && isValidCut(block, start, c2, seg2)) {
                cut = c2;
                break;
              }
            }
          }
        }

        // c. 空白：断在空白之前，空白留在本段右端统一 trim
        if (cut === null) {
          for (var k = Math.min(block.length - 1, start + max); k >= start + minLen; k--) {
            if (isSpace(block[k])) {
              var c3 = safeCut(block, consumeSpaces(block, k), start);
              var seg3 = trimRight(block.slice(start, c3));
              if (seg3.length >= minLen && seg3.length <= max && tailOk(c3) && isValidCut(block, start, c3, seg3)) {
                cut = c3;
                break;
              }
            }
          }
        }

        // d/e. 没有标点/空白：尽量在 [minLen, max] 内找一个不切单词的硬断点
        if (cut === null) {
          var upper = Math.min(block.length, start + max);
          for (var h = upper; h >= start + minLen; h--) {
            var hc = safeCut(block, h, start);
            var hs = trimRight(block.slice(start, hc));
            if (hs.length < minLen || hs.length > max) continue;
            if (!tailOk(hc)) continue;
            if (!isValidCut(block, start, hc, hs)) continue;
            if (hc < block.length && WORD_CHAR.test(block.charAt(hc - 1)) && WORD_CHAR.test(block.charAt(hc))) continue;
            cut = hc;
            break;
          }
          // 整个窗口都在一个超长单词里：退到词首或整词过行，不切断拉丁词
          if (cut === null) {
            cut = safeCut(block, upper, start);
            if (cut < block.length) {
              var prevCh = block.charAt(cut - 1);
              var nextCh = block.charAt(cut);
              if (WORD_CHAR.test(prevCh) && WORD_CHAR.test(nextCh)) {
                var wordStart = cut - 1;
                while (wordStart > start && WORD_CHAR.test(block.charAt(wordStart - 1))) wordStart--;
                var wordEnd = cut;
                while (wordEnd < block.length && WORD_CHAR.test(block.charAt(wordEnd))) wordEnd++;
                if (wordStart > start && wordStart - start >= minLen) {
                  cut = wordStart;
                } else if (wordEnd > cut) {
                  cut = wordEnd;
                }
              }
            }
            cut = safeCut(block, cut, start);
            while (cut < block.length && CLOSING.indexOf(block.charAt(cut)) >= 0) cut++;
            while (cut > start && OPENING.indexOf(block.charAt(cut - 1)) >= 0) cut--;
            while (cut > start && isSpace(block.charAt(cut - 1))) cut--;
            while (cut < block.length && isSpace(block.charAt(cut))) cut++;
          }
        }

        if (cut <= start) cut = Math.min(block.length, start + codePointAdvance(block, start));
        var piece = trimRight(block.slice(start, cut));
        if (!piece) {
          cut = Math.min(block.length, start + codePointAdvance(block, start));
          piece = block.slice(start, cut);
        }
        segs.push({ text: piece, start: start });
        start = cut;
      }

      // 孤行保护：末段不足 minLen 时并入前一段；用原文区间合并，保留被 trim 的空格
      if (segs.length > 1 && segs[segs.length - 1].text.length < minLen) {
        var prev = segs[segs.length - 2];
        prev.text = trimRight(block.slice(prev.start, block.length));
        segs.pop();
      }
      segs = segs.map(function (entry) { return entry.text; });
      return segs;
    }

    for (var b = 0; b < blocks.length; b++) {
      if (blocks[b]) {
        var part = splitBlock(blocks[b]);
        for (var p = 0; p < part.length; p++) result.push(part[p]);
      }
    }
    return result;
  }

  function escapeChar(ch) {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === ' ') return '&nbsp;';
    return ch;
  }

  function splitOversizedSegments(segments, maxLen) {
    var minLen = Math.ceil(maxLen * MIN_RATIO);
    var out = [];
    segments.forEach(function (segment) {
      var start = 0;
      while (segment.length - start > maxLen) {
        var upper = Math.min(segment.length, start + maxLen);
        var cut = upper;
        for (var i = upper - 1; i >= start + minLen; i--) {
          if (/[\s，。！？、；：,.;:!?]/.test(segment.charAt(i))) { cut = i + 1; break; }
        }
        cut = safeCut(segment, cut, start);
        if (cut <= start) cut = upper;
        out.push(segment.slice(start, cut));
        start = cut;
      }
      if (start < segment.length) out.push(segment.slice(start));
    });
    return out;
  }

  var verifyFailureLogged = false;
  function verifySegments(text, segments, offsets) {
    if (!Array.isArray(segments) || !Array.isArray(offsets) || segments.length !== offsets.length) {
      return { ok: false, reason: 'segments/offsets length mismatch' };
    }
    var cursor = 0;
    for (var i = 0; i < segments.length; i++) {
      var off = offsets[i];
      if (!Number.isInteger(off) || off < cursor || off > text.length) {
        return { ok: false, reason: 'bad offset at ' + i };
      }
      var gap = text.slice(cursor, off);
      if (gap && !/^[ \t\u00a0\r\n]*$/.test(gap)) {
        return { ok: false, reason: 'non-whitespace gap at ' + i };
      }
      if (text.slice(off, off + segments[i].length) !== segments[i]) {
        return { ok: false, reason: 'segment mismatch at ' + i };
      }
      cursor = off + segments[i].length;
    }
    var tail = text.slice(cursor);
    if (tail && !/^[ \t\u00a0\r\n]*$/.test(tail)) {
      return { ok: false, reason: 'non-whitespace tail' };
    }
    return { ok: true };
  }

  function splitTextWithOffsets(text, maxLen, strictMax) {
    var source = String(text == null ? '' : text);
    var segments = splitTextIntoSegments(source, maxLen);
    if (strictMax) segments = splitOversizedSegments(segments, Math.max(4, parseInt(maxLen, 10) || MAX_LINE));
    var offsets = [];
    var cursor = 0;
    var effectiveMax = Math.max(4, parseInt(maxLen, 10) || MAX_LINE);
    for (var i = 0; i < segments.length; i++) {
      var segment = segments[i];
      var scan = cursor;
      while (scan < source.length && !source.startsWith(segment, scan)) {
        if (!/[ \t\u00a0\r\n]/.test(source.charAt(scan))) break;
        scan++;
      }
      if (source.startsWith(segment, scan)) {
        offsets.push(scan);
        cursor = scan + segment.length;
      } else {
        console.error('[打字分段] 段无法在原文对齐', { index: i, segment: segment.slice(0, 40), cursor: cursor });
        var hardEnd = Math.min(source.length, cursor + effectiveMax);
        if (hardEnd <= cursor) hardEnd = source.length;
        segments[i] = source.slice(cursor, hardEnd);
        offsets.push(cursor);
        cursor = hardEnd;
      }
    }
    var check = verifySegments(source, segments, offsets);
    if (!check.ok && !verifyFailureLogged) {
      verifyFailureLogged = true;
      console.error('[打字分段] verifySegments 失败', check.reason);
    }
    return { segments: segments, offsets: offsets };
  }

  function measureMaxLen(element) {
    var host = element && element.nodeType === 1 ? element : document.body;
    var probe = document.createElement('div');
    probe.className = 'typing-line-text';
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;';
    host.appendChild(probe);
    var cs = getComputedStyle(probe);
    var hostStyle = getComputedStyle(host);
    var width = host.clientWidth || document.documentElement.clientWidth;
    var avail = (width - (parseFloat(hostStyle.paddingLeft) || 0) - (parseFloat(hostStyle.paddingRight) || 0)) * 0.98;
    var fontSize = parseFloat(cs.fontSize) || 16;
    var cjk = fontSize;
    var ascii = fontSize * 0.5;
    try {
      var ctx = document.createElement('canvas').getContext('2d');
      if (ctx && cs.font) {
        ctx.font = cs.font;
        cjk = ctx.measureText('中').width || cjk;
        ascii = ctx.measureText('a').width || ascii;
      }
    } catch (e) {}
    var n;
    if (cjk > 0 && ascii > 0) n = Math.floor(avail / Math.max(cjk, ascii));
    else n = Math.floor(avail / fontSize);
    if (!Number.isFinite(n) || n <= 0) n = 32;
    n = Math.max(8, Math.min(40, n));
    probe.parentNode.removeChild(probe);
    return n;
  }

  function scrollLineToCurrent(scope) {
    var root = scope && scope.querySelector ? scope : document;
    var page = root.querySelector('.typing-page.active');
    if (!page) return;
    var textEl = page.querySelector('.typing-line-text');
    var current = textEl && textEl.querySelector('.char.current');
    if (!textEl || !current) return;
    var max = textEl.scrollWidth - textEl.clientWidth;
    if (max <= 0) {
      if (textEl.scrollLeft !== 0) textEl.scrollLeft = 0;
      return;
    }
    // char 是 inline span，offsetLeft 相对 offsetParent 不可靠，用 rect 换算
    var lineRect = textEl.getBoundingClientRect();
    var charRect = current.getBoundingClientRect();
    var target = textEl.scrollLeft + charRect.left - lineRect.left - textEl.clientWidth / 2 + charRect.width / 2;
    if (!Number.isFinite(target)) return;
    textEl.scrollLeft = Math.max(0, Math.min(max, target));
  }

  var pendingScrollFrame = 0;
  function scheduleCurrentLineScroll(event) {
    var target = event && event.target;
    if (!target || !target.classList || !target.classList.contains('typing-line-input')) return;
    if (pendingScrollFrame) return;
    pendingScrollFrame = global.requestAnimationFrame(function () {
      pendingScrollFrame = 0;
      scrollLineToCurrent(document);
    });
  }

  // 首页练习区仍由 script.js 自己渲染，这里统一兜住它的当前行跟随
  document.addEventListener('input', scheduleCurrentLineScroll, true);
  document.addEventListener('compositionend', scheduleCurrentLineScroll, true);

  // P47：练习页 script.js 与比赛页引擎共用同一张规则表，纯判断不含 DOM 状态
  var lineRules = {
    filled: function (value, segLen) {
      return String(value == null ? '' : value).length >= segLen;
    },
    // 只在「未满 → 填满」那一瞬跳行；已满行回改时不跳，否则选区重打会被弹走
    shouldAdvance: function (prevValue, value, segLen) {
      return !lineRules.filled(prevValue, segLen) && lineRules.filled(value, segLen);
    },
    // 有选区时按退格只删选区，不回跳
    shouldJumpBack: function (input) {
      return !!input && input.selectionStart === 0 && input.selectionEnd === 0;
    },
    firstUnfilled: function (values, segments) {
      for (var i = 0; i < segments.length; i++) {
        if (!lineRules.filled(values[i], segments[i].length)) return i;
      }
      return -1;
    },
    // 从 index 之后找第一个未满行；找不到返回 -1，由调用方决定回卷
    nextUnfilled: function (values, segments, index) {
      for (var i = index + 1; i < segments.length; i++) {
        if (!lineRules.filled(values[i], segments[i].length)) return i;
      }
      return -1;
    },
    unfilledCount: function (values, segments) {
      var n = 0;
      for (var i = 0; i < segments.length; i++) {
        if (!lineRules.filled(values[i], segments[i].length)) n++;
      }
      return n;
    }
  };

  var lineHintTimer = 0;
  function showLineHint(pageEl, text) {
    if (!pageEl || !pageEl.appendChild) return;
    var el = pageEl.querySelector('.typing-line-hint');
    if (!el) {
      el = document.createElement('div');
      el.className = 'typing-line-hint';
      el.setAttribute('role', 'status');
      pageEl.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('show');
    if (lineHintTimer) clearTimeout(lineHintTimer);
    lineHintTimer = setTimeout(function () {
      el.classList.remove('show');
      lineHintTimer = 0;
    }, 2000);
  }

  function create(container, options) {
    var text = options.text || '';
    var onChange = options.onChange || function () {};
    var onFinish = options.onFinish || function () {};

    var maxLen = options.maxLen;
    if (!maxLen && global.TypingEngine && global.TypingEngine.measureMaxLen) {
      maxLen = global.TypingEngine.measureMaxLen(container);
    }
    var split = splitTextWithOffsets(text, maxLen || MAX_LINE, true);
    var segments = split.segments;
    var offsets = split.offsets;
    var charStates = new Array(text.length).fill('pending');
    var inputs = [];
    var pages = [];
    var values = [];
    var currentIndex = 0;
    var isComposing = false;
    var enabled = !!options.enabled;
    var finished = false;
    var startedAt = 0;

    container.innerHTML = '';
    container.classList.add('typing-pages');

    for (var i = 0; i < segments.length; i++) values.push('');

    function offsetOf(index) {
      return offsets[index] || 0;
    }

    function syncLine(index) {
      var filled = lineRules.filled(values[index], segments[index].length);
      if (pages[index]) pages[index].classList.toggle('completed', filled);
      if (inputs[index]) inputs[index].classList.toggle('completed', filled);
    }

    function setCurrent(index) {
      currentIndex = index;
      for (var i = 0; i < pages.length; i++) {
        if (pages[i]) pages[i].classList.toggle('active', i === index);
      }
      clearOtherCurrentMarks(index);
      var len = (values[index] || '').length;
      if (len < segments[index].length) {
        charStates[offsetOf(index) + len] = 'current';
        renderText(index);
      }
      scrollLineToCurrent(container);
    }

    // 光标下划线只留在聚焦行，否则跳行后每行都留一条旧标记
    function clearOtherCurrentMarks(exceptIndex) {
      for (var i = 0; i < segments.length; i++) {
        if (i === exceptIndex) continue;
        var len = (values[i] || '').length;
        var pos = offsetOf(i) + len;
        if (len < segments[i].length && charStates[pos] === 'current') {
          charStates[pos] = 'pending';
          renderText(i);
        }
      }
    }

    function focusLine(index, caretAtEnd) {
      var input = inputs[index];
      if (!input || input.disabled) return;
      setCurrent(index);
      input.focus();
      var pos = caretAtEnd ? input.value.length : Math.min(input.selectionStart || 0, input.value.length);
      input.setSelectionRange(pos, pos);
      var page = pages[index];
      if (page && page.scrollIntoView) page.scrollIntoView({ block: 'nearest' });
      scrollLineToCurrent(container);
    }

    function onLineKeydown(index, event) {
      if (!enabled || finished) return;
      var input = inputs[index];
      if (event.key === 'Backspace' && index > 0 && lineRules.shouldJumpBack(input)) {
        event.preventDefault();
        focusLine(index - 1, true);
        return;
      }
      if (event.key === 'ArrowUp' && index > 0) {
        event.preventDefault();
        focusLine(index - 1, false);
        return;
      }
      if (event.key === 'ArrowDown' && index < inputs.length - 1) {
        event.preventDefault();
        focusLine(index + 1, false);
      }
    }

    function build() {
      container.innerHTML = '';
      inputs = [];
      pages = [];
      segments.forEach(function (segment, index) {
        var filled = lineRules.filled(values[index], segment.length);
        var page = document.createElement('div');
        page.className = 'typing-page' + (index === currentIndex ? ' active' : '') + (filled ? ' completed' : '');

        var textEl = document.createElement('div');
        textEl.className = 'typing-line-text';
        textEl.id = 'race-typing-text-' + index;
        page.appendChild(textEl);

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'typing-line-input' + (filled ? ' completed' : '');
        input.value = values[index] || '';
        input.spellcheck = false;
        input.autocomplete = 'off';
        input.autocapitalize = 'off';
        input.autocorrect = 'off';
        input.setAttribute('aria-label', '第 ' + (index + 1) + ' 段输入');
        input.disabled = !enabled || finished;

        input.addEventListener('input', function () {
          if (isComposing) return;
          handle(index, input.value);
        });
        input.addEventListener('compositionstart', function () { isComposing = true; });
        input.addEventListener('compositionend', function () {
          isComposing = false;
          handle(index, input.value);
        });
        input.addEventListener('focus', function () {
          if (enabled && !finished) setCurrent(index);
        });
        input.addEventListener('keydown', function (event) { onLineKeydown(index, event); });
        input.addEventListener('paste', preventClipboard);
        input.addEventListener('drop', preventClipboard);

        page.appendChild(input);
        inputs.push(input);
        pages.push(page);
        container.appendChild(page);
        renderText(index);
      });
      scrollToCurrent();
    }

    function preventClipboard(event) { event.preventDefault(); }

    function renderText(index) {
      var el = document.getElementById('race-typing-text-' + index);
      if (!el) return;
      var segment = segments[index];
      var off = offsetOf(index);
      var html = '';
      for (var i = 0; i < segment.length; i++) {
        html += '<span class="char ' + (charStates[off + i] || 'pending') + '">' + escapeChar(segment[i]) + '</span>';
      }
      el.innerHTML = html;
    }

    // 重连时把服务端进度灌回输入区，用户可以从上次的位置继续
    function restore(typedCount) {
      var remain = Math.max(0, Math.min(text.length, Number(typedCount) || 0));
      values = new Array(segments.length).fill('');
      charStates = new Array(text.length).fill('pending');
      var left = remain;
      for (var i = 0; i < segments.length; i++) {
        var take = Math.min(segments[i].length, left);
        if (take > 0) {
          values[i] = segments[i].slice(0, take);
          var off = offsetOf(i);
          for (var k = 0; k < take; k++) charStates[off + k] = 'correct';
        }
        left -= take;
        if (take < segments[i].length) {
          currentIndex = i;
          charStates[offsetOf(i) + take] = 'current';
          break;
        }
        currentIndex = i;
      }
      build();
    }

    function handle(index, value) {
      if (!enabled || finished) return;
      var segment = segments[index];
      var prevValue = values[index] || '';
      if (value.length > segment.length) {
        value = value.slice(0, segment.length);
        inputs[index].value = value;
      }
      var off = offsetOf(index);
      // 只重算本段状态，其它行不动
      for (var i = 0; i < segment.length; i++) charStates[off + i] = 'pending';
      for (var k = 0; k < value.length; k++) {
        charStates[off + k] = value[k] === segment[k] ? 'correct' : 'wrong';
      }
      if (value.length < segment.length) charStates[off + value.length] = 'current';
      values[index] = value;
      renderText(index);
      syncLine(index);
      emit();

      if (lineRules.firstUnfilled(values, segments) < 0) {
        finished = true;
        inputs.forEach(function (input) { input.disabled = true; });
        emit(true);
        onFinish(state());
        return;
      }

      if (lineRules.shouldAdvance(prevValue, value, segment.length)) {
        var target = lineRules.nextUnfilled(values, segments, index);
        if (target < 0) {
          target = lineRules.firstUnfilled(values, segments);
          focusLine(target, true);
          showLineHint(pages[target], '还有 ' + lineRules.unfilledCount(values, segments) + ' 行没打完');
        } else {
          focusLine(target, true);
        }
      }
    }

    function state() {
      var typed = 0, correct = 0, wrong = 0;
      values.forEach(function (v) { typed += v.length; });
      charStates.forEach(function (s) {
        if (s === 'correct') correct++;
        else if (s === 'wrong') wrong++;
      });
      var checked = correct + wrong;
      return {
        typed: typed,
        correct: correct,
        wrong: wrong,
        accuracy: checked > 0 ? Math.round(correct / checked * 1000) / 10 : 100,
        segments: segments.length,
        currentIndex: currentIndex,
        elapsedMs: startedAt ? Date.now() - startedAt : 0
      };
    }

    function emit(done) {
      onChange(state(), !!done);
    }

    function focus() {
      var input = inputs[currentIndex];
      // 比赛每次 tick 都会 enable(true)，已聚焦时不能再 focus，否则光标被重置
      if (input && !input.disabled && document.activeElement !== input) input.focus();
    }

    function scrollToCurrent() {
      var page = pages[currentIndex];
      if (page && page.scrollIntoView) page.scrollIntoView({ block: 'nearest' });
      scrollLineToCurrent(container);
    }

    build();

    return {
      focus: focus,
      state: state,
      restore: restore,
      enable: function (flag) {
        enabled = !!flag;
        if (enabled && !startedAt) startedAt = Date.now();
        inputs.forEach(function (input) {
          input.disabled = !enabled || finished;
        });
        if (enabled) focus();
      },
      destroy: function () { container.innerHTML = ''; },
      segments: segments
    };
  }

  global.TypingEngine = {
    create: create,
    splitTextIntoSegments: splitTextIntoSegments,
    splitTextWithOffsets: splitTextWithOffsets,
    measureMaxLen: measureMaxLen,
    lineRules: lineRules,
    showLineHint: showLineHint
  };
})(window);
