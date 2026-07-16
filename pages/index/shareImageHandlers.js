const { createWeekDays } = require('../../utils/date.js');

const CANVAS_ID = 'memoShareCanvas';
const IMAGE_WIDTH = 500;
const IMAGE_HEIGHT = 400;
const IMAGE_RENDER_TIMEOUT_MS = 1800;
const IMAGE_CACHE_LIMIT = 12;
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMemoCategoryContent(memo, lang) {
  const isCustomCategory = typeof memo.tag === 'string'
    && memo.tag.indexOf('custom-') === 0;
  if (!isCustomCategory) return memo.categoryIcon || '';

  const primaryLabel = lang === 'en' ? memo.tagEn : memo.tagCn;
  const fallbackLabel = lang === 'en' ? memo.tagCn : memo.tagEn;
  return primaryLabel || fallbackLabel || '';
}

function createShareImageCacheKey(date, memo, lang, categoryContent) {
  return JSON.stringify([
    lang,
    date,
    memo.id,
    memo.title,
    memo.time,
    memo.location,
    memo.color,
    categoryContent
  ]);
}

function touchCacheKey(page, cacheKey) {
  const order = page.memoShareImageCacheOrder;
  const index = order.indexOf(cacheKey);
  if (index !== -1) order.splice(index, 1);
  order.push(cacheKey);
}

function removeCacheEntry(page, cacheKey, expectedPromise) {
  if (
    !page.memoShareImageCache ||
    page.memoShareImageCache[cacheKey] !== expectedPromise
  ) {
    return;
  }
  delete page.memoShareImageCache[cacheKey];
  if (!page.memoShareImageCacheOrder) return;
  const index = page.memoShareImageCacheOrder.indexOf(cacheKey);
  if (index !== -1) page.memoShareImageCacheOrder.splice(index, 1);
}

function storeCacheEntry(page, cacheKey, promise) {
  page.memoShareImageCache[cacheKey] = promise;
  touchCacheKey(page, cacheKey);
  while (page.memoShareImageCacheOrder.length > IMAGE_CACHE_LIMIT) {
    const oldestKey = page.memoShareImageCacheOrder.shift();
    delete page.memoShareImageCache[oldestKey];
  }
}

function truncateText(ctx, value, maxWidth) {
  const text = typeof value === 'string' ? value : '';
  if (!text || typeof ctx.measureText !== 'function' || ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  const characters = Array.from(text);
  let end = characters.length;
  while (end > 0 && ctx.measureText(`${characters.slice(0, end).join('')}...`).width > maxWidth) {
    end -= 1;
  }
  return `${characters.slice(0, end).join('')}...`;
}

function getSelectedDateLabel(days, lang) {
  const selected = days.find(day => day.selected);
  if (!selected) return '';
  if (lang === 'en') {
    return `${MONTHS_EN[selected.month - 1]} ${selected.day}, ${selected.year}`;
  }
  return `${selected.year}年${selected.month}月${selected.day}日`;
}

function drawMemoDot(ctx, color, centerX, centerY) {
  ctx.beginPath();
  ctx.setFillStyle(color || '#fa8231');
  ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
  ctx.fill();
}

module.exports = {
  createMemoShareImage(date, memo) {
    if (
      typeof wx === 'undefined' ||
      typeof wx.createCanvasContext !== 'function' ||
      typeof wx.canvasToTempFilePath !== 'function'
    ) {
      return Promise.resolve('');
    }

    const days = createWeekDays(date);
    if (days.length !== 7) return Promise.resolve('');

    if (!this.memoShareImageCache) {
      this.memoShareImageCache = Object.create(null);
      this.memoShareImageCacheOrder = [];
    }
    const categoryContent = getMemoCategoryContent(memo, this.data.lang);
    const cacheKey = createShareImageCacheKey(date, memo, this.data.lang, categoryContent);
    if (this.memoShareImageCache[cacheKey]) {
      touchCacheKey(this, cacheKey);
      return this.memoShareImageCache[cacheKey];
    }

    const renderPromise = new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId = null;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) clearTimeout(timeoutId);
        callback(value);
      };
      timeoutId = setTimeout(() => {
        settle(resolve, '');
      }, IMAGE_RENDER_TIMEOUT_MS);
      let ctx;
      try {
        ctx = wx.createCanvasContext(CANVAS_ID, this);
      } catch (error) {
        settle(reject, error);
        return;
      }
      const lang = this.data.lang;
      const weekdays = Array.isArray(this.data.text.weekdays) ? this.data.text.weekdays : [];
      const padding = 28;
      const columnWidth = (IMAGE_WIDTH - padding * 2) / 7;

      ctx.setFillStyle('#ffffff');
      ctx.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);

      ctx.setFillStyle('#111827');
      ctx.setFontSize(22);
      ctx.setTextAlign('left');
      ctx.fillText(getSelectedDateLabel(days, lang), padding, 38);

      ctx.setStrokeStyle('#e5e7eb');
      ctx.setLineWidth(1);
      ctx.beginPath();
      ctx.moveTo(padding, 58);
      ctx.lineTo(IMAGE_WIDTH - padding, 58);
      ctx.stroke();

      days.forEach((day, index) => {
        const centerX = padding + columnWidth * index + columnWidth / 2;
        ctx.setTextAlign('center');
        ctx.setFontSize(13);
        ctx.setFillStyle('#6b7280');
        ctx.fillText(weekdays[index], centerX, 88);

        if (day.selected) {
          ctx.beginPath();
          ctx.setFillStyle('#fa8231');
          ctx.arc(centerX, 124, 20, 0, Math.PI * 2);
          ctx.fill();
          ctx.setFillStyle('#ffffff');
        } else {
          ctx.setFillStyle('#1f2937');
        }
        ctx.setFontSize(18);
        ctx.fillText(String(day.day), centerX, 131);

        if (day.selected) {
          drawMemoDot(ctx, memo.color, centerX, 160);
        }
      });

      ctx.setStrokeStyle('#e5e7eb');
      ctx.beginPath();
      ctx.moveTo(padding, 188);
      ctx.lineTo(IMAGE_WIDTH - padding, 188);
      ctx.stroke();

      ctx.setFillStyle(memo.color || '#fa8231');
      ctx.fillRect(padding, 216, 5, 136);

      ctx.setTextAlign('left');
      ctx.setFillStyle('#111827');
      ctx.setFontSize(25);
      ctx.fillText(truncateText(ctx, memo.title, 390), 48, 250);

      const details = [];
      if (memo.time) details.push(memo.time);
      if (memo.location) details.push(memo.location);
      ctx.setFillStyle('#4b5563');
      ctx.setFontSize(17);
      ctx.fillText(truncateText(ctx, details.join('  ·  '), 410), 48, 294);

      if (categoryContent) {
        ctx.setFillStyle('#374151');
        ctx.setFontSize(20);
        ctx.fillText(truncateText(ctx, categoryContent, 410), 48, 338);
      }

      ctx.draw(false, () => {
        wx.canvasToTempFilePath({
          canvasId: CANVAS_ID,
          width: IMAGE_WIDTH,
          height: IMAGE_HEIGHT,
          destWidth: IMAGE_WIDTH,
          destHeight: IMAGE_HEIGHT,
          fileType: 'png',
          success: result => settle(resolve, result.tempFilePath || ''),
          fail: error => settle(reject, error)
        }, this);
      });
    });

    const cachedPromise = renderPromise.then(imageUrl => {
      if (!imageUrl) removeCacheEntry(this, cacheKey, cachedPromise);
      return imageUrl;
    }).catch(error => {
      removeCacheEntry(this, cacheKey, cachedPromise);
      throw error;
    });
    storeCacheEntry(this, cacheKey, cachedPromise);
    return cachedPromise;
  },

  clearMemoShareImageCache() {
    this.memoShareImageCache = null;
    this.memoShareImageCacheOrder = null;
  }
};
