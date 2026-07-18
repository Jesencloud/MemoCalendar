const { cleanMemosUIFields } = require('../../utils/memos.js');

const DRAG_TRANSLATE_THROTTLE_MS = 48;
const DRAG_AUTO_SCROLL_EDGE_PX = 50;
const DRAG_AUTO_SCROLL_INTERVAL_MS = 16;
const DRAG_AUTO_SCROLL_MAX_PX = 10;
const SWIPE_AUTO_CLOSE_MS = 3000;

function getDragViewportHeight(page) {
  if (page.dragViewportHeight) return page.dragViewportHeight;
  if (typeof wx === 'undefined' || typeof wx.getSystemInfoSync !== 'function') return 0;

  try {
    const systemInfo = wx.getSystemInfoSync();
    page.dragViewportHeight = Number(systemInfo.windowHeight) || 0;
  } catch (error) {
    page.dragViewportHeight = 0;
  }
  return page.dragViewportHeight;
}

function getDragAutoScrollDelta(page, clientY) {
  const viewportHeight = getDragViewportHeight(page);
  if (!viewportHeight || typeof clientY !== 'number') return 0;

  const topDistance = clientY;
  const bottomDistance = viewportHeight - clientY;
  if (topDistance < DRAG_AUTO_SCROLL_EDGE_PX) {
    const ratio = Math.min(1, (DRAG_AUTO_SCROLL_EDGE_PX - topDistance) / DRAG_AUTO_SCROLL_EDGE_PX);
    return -Math.max(
      1,
      Math.ceil(ratio * DRAG_AUTO_SCROLL_MAX_PX)
    );
  }
  if (bottomDistance < DRAG_AUTO_SCROLL_EDGE_PX) {
    const ratio = Math.min(1, (DRAG_AUTO_SCROLL_EDGE_PX - bottomDistance) / DRAG_AUTO_SCROLL_EDGE_PX);
    return Math.max(
      1,
      Math.ceil(ratio * DRAG_AUTO_SCROLL_MAX_PX)
    );
  }
  return 0;
}

function readDragScrollTop(page, callback) {
  const fallback = page.dragScrollTop || 0;
  if (
    typeof wx === 'undefined' ||
    typeof wx.createSelectorQuery !== 'function'
  ) {
    callback(fallback);
    return;
  }

  let query;
  try {
    query = wx.createSelectorQuery();
  } catch (error) {
    callback(fallback);
    return;
  }
  if (!query || typeof query.selectViewport !== 'function') {
    callback(fallback);
    return;
  }

  query.selectViewport().scrollOffset(offset => {
    callback(offset && typeof offset.scrollTop === 'number' ? offset.scrollTop : fallback);
  }).exec();
}

function getCardCenterY(page, rect) {
  return rect.top - (page.dragScrollOffset || 0) + rect.height / 2;
}

function applyDragScrollDelta(page, delta) {
  if (!delta || !Array.isArray(page.cardRects)) return;
  page.dragScrollOffset = (page.dragScrollOffset || 0) + delta;
  updateDraggedMemoPosition(page, page.lastDragTouchY, false);
}

function getDragResetData(extraData = {}) {
  return Object.assign({
    draggingId: '',
    dragTranslateY: 0,
    dragPreviewReady: false,
    dragPreviewTop: 0,
    dragPreviewLeft: 0,
    dragPreviewWidth: 0,
    dragPreviewHeight: 0
  }, extraData);
}

function updateDraggedMemoPosition(page, clientY, updatePreviewPosition) {
  if (!Array.isArray(page.cardRects) || typeof clientY !== 'number') return;

  const currentRect = page.cardRects[page.dragIndex];
  if (!currentRect) return;

  const deltaY = clientY - page.dragStartY;
  const previewTop = page.data.dragPreviewTop;
  const previewHeight = page.data.dragPreviewHeight || currentRect.height;
  const currentCenterY = previewTop + previewHeight / 2 + deltaY;

  let targetIndex = page.dragIndex;
  if (
    page.dragIndex + 1 < page.cardRects.length &&
    currentCenterY > getCardCenterY(page, page.cardRects[page.dragIndex + 1])
  ) {
    for (let i = page.dragIndex + 1; i < page.cardRects.length; i += 1) {
      if (currentCenterY <= getCardCenterY(page, page.cardRects[i])) break;
      targetIndex = i;
    }
  } else if (
    page.dragIndex > 0 &&
    currentCenterY < getCardCenterY(page, page.cardRects[page.dragIndex - 1])
  ) {
    for (let i = page.dragIndex - 1; i >= 0; i -= 1) {
      if (currentCenterY >= getCardCenterY(page, page.cardRects[i])) break;
      targetIndex = i;
    }
  }

  const nextData = {};
  let shouldSetData = false;
  const orderChanged = targetIndex !== page.dragIndex;
  if (orderChanged) {
    const list = [...page.data.selectedMemos];
    const draggedItem = list[page.dragIndex];
    list.splice(page.dragIndex, 1);
    list.splice(targetIndex, 0, draggedItem);
    page.dragIndex = targetIndex;
    nextData.selectedMemos = list;
    shouldSetData = true;
    page.vibrate();
  }

  if (updatePreviewPosition) {
    const now = Date.now();
    const dragTranslateY = Math.round(deltaY);
    if (
      orderChanged ||
      (
        now - page.lastDragSetDataTime > DRAG_TRANSLATE_THROTTLE_MS &&
        Math.abs(dragTranslateY - page.lastDragTranslateY) >= 2
      )
    ) {
      nextData.dragTranslateY = dragTranslateY;
      page.lastDragSetDataTime = now;
      page.lastDragTranslateY = dragTranslateY;
      shouldSetData = true;
    }
  }

  if (shouldSetData) {
    page.setData(nextData);
  }
}

function stopDragAutoScroll(page) {
  page.dragScrollToken = (page.dragScrollToken || 0) + 1;
  page.dragAutoScrollActive = false;
  page.dragScrollPending = false;
  if (page.dragScrollTimer) {
    clearTimeout(page.dragScrollTimer);
    page.dragScrollTimer = null;
  }
}

function runDragAutoScroll(page, token) {
  if (
    token !== page.dragScrollToken ||
    !page.dragAutoScrollActive ||
    !page.data.draggingId
  ) return;

  const delta = getDragAutoScrollDelta(page, page.lastDragTouchY);
  if (!delta || page.dragScrollPending) return;

  const currentScrollTop = page.dragScrollTop || 0;
  const targetScrollTop = Math.max(0, currentScrollTop + delta);
  if (targetScrollTop === currentScrollTop) {
    stopDragAutoScroll(page);
    return;
  }

  if (typeof wx === 'undefined' || typeof wx.pageScrollTo !== 'function') {
    stopDragAutoScroll(page);
    return;
  }

  page.dragScrollPending = true;
  const finishScroll = () => {
    if (token !== page.dragScrollToken || !page.data.draggingId) return;
    readDragScrollTop(page, actualScrollTop => {
      if (token !== page.dragScrollToken || !page.data.draggingId) return;

      const actualDelta = actualScrollTop - currentScrollTop;
      page.dragScrollTop = actualScrollTop;
      page.dragScrollPending = false;
      if (!actualDelta) {
        stopDragAutoScroll(page);
        return;
      }
      applyDragScrollDelta(page, actualDelta);

      if (!getDragAutoScrollDelta(page, page.lastDragTouchY)) {
        page.dragAutoScrollActive = false;
        return;
      }
      page.dragScrollTimer = setTimeout(() => {
        page.dragScrollTimer = null;
        runDragAutoScroll(page, token);
      }, DRAG_AUTO_SCROLL_INTERVAL_MS);
    });
  };

  try {
    wx.pageScrollTo({
      scrollTop: targetScrollTop,
      duration: 0,
      complete: finishScroll
    });
  } catch (error) {
    stopDragAutoScroll(page);
  }
}

function updateDragAutoScroll(page, clientY) {
  page.lastDragTouchY = clientY;
  const delta = getDragAutoScrollDelta(page, clientY);
  if (!delta) {
    stopDragAutoScroll(page);
    return;
  }
  if (page.dragAutoScrollActive) return;

  page.dragAutoScrollActive = true;
  page.dragScrollToken = (page.dragScrollToken || 0) + 1;
  runDragAutoScroll(page, page.dragScrollToken);
}

function prepareDragLayout(page, id, index) {
  if (typeof wx === 'undefined' || typeof wx.createSelectorQuery !== 'function') return;

  let query;
  try {
    query = wx.createSelectorQuery();
    query.selectAll('.memo-card-wrapper').boundingClientRect();
    query.selectViewport().scrollOffset();
    query.exec(results => {
      if (page.data.draggingId !== id) return;

      const rects = results && Array.isArray(results[0]) ? results[0] : [];
      const scrollOffset = results && results[1];
      const currentRect = rects[index];
      if (!currentRect) return;

      page.cardRects = rects;
      page.dragScrollTop = scrollOffset && typeof scrollOffset.scrollTop === 'number'
        ? scrollOffset.scrollTop
        : 0;
      page.dragScrollOffset = 0;
      page.setData({
        dragPreviewReady: true,
        dragPreviewTop: Math.round(currentRect.top),
        dragPreviewLeft: Math.round(currentRect.left || 0),
        dragPreviewWidth: Math.round(currentRect.width || 0),
        dragPreviewHeight: Math.round(currentRect.height)
      });
    });
  } catch (error) {
    page.cardRects = null;
  }
}

module.exports = {
  stopDragAutoScroll() {
    stopDragAutoScroll(this);
  },

  clearSwipeCloseTimer() {
    this.swipeCloseToken = (this.swipeCloseToken || 0) + 1;
    if (this.swipeCloseTimer) {
      clearTimeout(this.swipeCloseTimer);
      this.swipeCloseTimer = null;
    }
  },

  closeSwipeActions() {
    this.clearSwipeCloseTimer();
    if (this.data.swipedMemoId) {
      this.setData({ swipedMemoId: '' });
    }
  },

  scheduleSwipeAutoClose(id, token) {
    this.swipeCloseTimer = setTimeout(() => {
      if (token !== this.swipeCloseToken) return;
      this.swipeCloseTimer = null;
      if (!this.memoMutationLock && this.data.swipedMemoId === id) {
        this.setData({ swipedMemoId: '' });
      }
    }, SWIPE_AUTO_CLOSE_MS);
  },

  restartSwipeAutoClose(id) {
    this.clearSwipeCloseTimer();
    if (!id || this.data.swipedMemoId !== id) return;
    this.scheduleSwipeAutoClose(id, this.swipeCloseToken);
  },

  openSwipeActions(id) {
    if (!id) {
      this.closeSwipeActions();
      return;
    }

    this.clearSwipeCloseTimer();
    const token = this.swipeCloseToken;
    this.setData({ swipedMemoId: id }, () => {
      if (token !== this.swipeCloseToken || this.data.swipedMemoId !== id) return;
      this.scheduleSwipeAutoClose(id, token);
    });
  },

  onSwipeTouchStart(e) {
    if (this.memoMutationLock) {
      this.swipeTouchActive = false;
      return;
    }
    const touch = e.touches[0];
    if (!touch) return;
    this.swipeTouchActive = true;
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.activeId = e.currentTarget.dataset.id;
  },

  onSwipeTouchEnd(e) {
    if (!this.swipeTouchActive) return;
    this.swipeTouchActive = false;
    if (this.memoMutationLock) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - this.startX;
    const deltaY = touch.clientY - this.startY;

    if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 40) {
      if (deltaX < 0) {
        this.openSwipeActions(this.activeId);
      } else {
        this.closeSwipeActions();
      }
    }
  },

  onSwipeTouchCancel() {
    this.swipeTouchActive = false;
    this.activeId = '';
  },

  onDragStart(e) {
    this.stopDragAutoScroll();
    if (this.memoMutationLock) return;
    this.clearSwipeCloseTimer();
    const { id, index } = e.currentTarget.dataset;
    const touch = e.touches[0];
    if (!touch) return;

    this.cardRects = null;
    this.dragStartY = touch.clientY;
    this.dragIndex = Number(index);
    this.lastDragTouchY = touch.clientY;
    this.dragScrollTop = 0;
    this.dragScrollOffset = 0;
    this.dragViewportHeight = 0;
    this.lastDragSetDataTime = 0;
    this.lastDragTranslateY = 0;
    
    this.vibrate();
    
    this.setData(getDragResetData({
      draggingId: id,
      swipedMemoId: ''
    }));

    prepareDragLayout(this, id, this.dragIndex);
  },

  onDragMove(e) {
    if (!this.data.draggingId || !this.cardRects) return;
    const touch = e.touches[0];
    if (!touch) return;
    updateDragAutoScroll(this, touch.clientY);
    updateDraggedMemoPosition(this, touch.clientY, true);
  },

  async onDragEnd() {
    this.stopDragAutoScroll();
    if (!this.data.draggingId) return;
    const mutationOwner = 'drag';
    if (!this.startMemoMutation(mutationOwner)) {
      this.setData(getDragResetData({
        sortOrder: 'desc'
      }), () => this.updateSelectedMemos());
      this.cardRects = null;
      this.lastDragTranslateY = 0;
      return;
    }

    try {
      const { selectedMemos, selectedDate } = this.data;
      const updatedMemoDates = Object.assign({}, this.memoDates);
      updatedMemoDates[selectedDate] = cleanMemosUIFields(selectedMemos);

      const saveSucceeded = await this.saveMemosToStorage(
        updatedMemoDates,
        selectedDate,
        { changedDateIsClean: true }
      );
      if (!saveSucceeded) {
        this.setData(getDragResetData({
          sortOrder: 'desc'
        }), () => {
          this.updateSelectedMemos();
        });
        return;
      }

      const nextData = getDragResetData({
        memoDateMeta: this.updateMemoDateMeta(this.data.memoDateMeta, selectedDate, selectedMemos),
        sortOrder: 'desc'
      });

      this.memoDates = updatedMemoDates;
      this.setData(nextData);
      this.vibrate('medium');
    } finally {
      this.cardRects = null;
      this.lastDragTranslateY = 0;
      if (this.memoMutationLock === mutationOwner) {
        this.releaseMemoMutation();
      }
    }
  },

  onDragCancel() {
    this.stopDragAutoScroll();
    if (!this.data.draggingId) return;

    this.cardRects = null;
    this.lastDragTranslateY = 0;
    this.setData(getDragResetData({
      sortOrder: 'desc'
    }), () => this.updateSelectedMemos());
  },

  async onMemoCompletedTap(e) {
    const { id } = e.currentTarget.dataset;
    const { selectedDate } = this.data;
    const mutationOwner = `toggle-completed:${id}`;
    if (!this.startMemoMutation(mutationOwner, id)) return;

    try {
      let found = false;
      const dayMemos = (this.memoDates[selectedDate] || []).map(item => {
        const cleanItem = Object.assign({}, item);
        delete cleanItem.isSwiped;
        if (cleanItem.id === id) {
          cleanItem.completed = !cleanItem.completed;
          found = true;
        }
        return cleanItem;
      });
      if (!found) return;

      this.vibrate();
      const updatedMemoDates = Object.assign({}, this.memoDates, {
        [selectedDate]: dayMemos
      });
      if (!await this.saveMemosToStorage(
        updatedMemoDates,
        selectedDate,
        { changedDateIsClean: true }
      )) return;

      this.memoDates = updatedMemoDates;
      const nextData = {
        memoDateMeta: this.updateMemoDateMeta(this.data.memoDateMeta, selectedDate, dayMemos),
        swipedMemoId: ''
      };
      if (this.data.selectedDate === selectedDate) {
        nextData.selectedMemos = dayMemos;
      }
      this.finishMemoMutation(nextData);
    } finally {
      if (this.memoMutationLock === mutationOwner) {
        this.finishMemoMutation();
        this.restartSwipeAutoClose(id);
      }
    }
  },

  onSwipeDeleteTap(e) {
    const { id } = e.currentTarget.dataset;
    this.deleteMemoById(id, {
      clearSwipeOnCancel: true
    });
  }
};
