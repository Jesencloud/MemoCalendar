const { cleanMemosUIFields } = require('../../utils/memos.js');

const DRAG_TRANSLATE_THROTTLE_MS = 48;
const SWIPE_AUTO_CLOSE_MS = 3000;

module.exports = {
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
    if (this.memoMutationLock) return;
    this.clearSwipeCloseTimer();
    const { id, index } = e.currentTarget.dataset;
    const touch = e.touches[0];

    this.dragStartY = touch.clientY;
    this.dragIndex = index;
    this.lastDragSetDataTime = 0;
    this.lastDragTranslateY = 0;
    
    this.vibrate();
    
    this.setData({
      draggingId: id,
      dragTranslateY: 0,
      swipedMemoId: ''
    });
    
    const query = wx.createSelectorQuery();
    query.selectAll('.memo-card-wrapper').boundingClientRect(rects => {
      this.cardRects = rects;
    }).exec();
  },

  onDragMove(e) {
    if (!this.data.draggingId || !this.cardRects) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - this.dragStartY;
    
    const currentRect = this.cardRects[this.dragIndex];
    if (!currentRect) return;
    const currentCenterY = currentRect.top + currentRect.height / 2 + deltaY;
    
    let targetIndex = this.dragIndex;
    for (let i = 0; i < this.cardRects.length; i++) {
      if (i === this.dragIndex) continue;
      const rect = this.cardRects[i];
      if (this.dragIndex < i && currentCenterY > rect.top + rect.height / 2) {
        targetIndex = i;
      } else if (this.dragIndex > i && currentCenterY < rect.top + rect.height / 2) {
        targetIndex = i;
      }
    }
    
    if (targetIndex !== this.dragIndex) {
      const list = [...this.data.selectedMemos];
      const draggedItem = list[this.dragIndex];
      
      list.splice(this.dragIndex, 1);
      list.splice(targetIndex, 0, draggedItem);
      
      const offset = this.cardRects[targetIndex].top - this.cardRects[this.dragIndex].top;
      this.dragStartY += offset;
      this.dragIndex = targetIndex;
      
      this.setData({
        selectedMemos: list,
        dragTranslateY: touch.clientY - this.dragStartY
      });
      this.lastDragSetDataTime = Date.now();
      this.lastDragTranslateY = touch.clientY - this.dragStartY;
      
      this.vibrate();
    } else {
      const now = Date.now();
      if (
        now - this.lastDragSetDataTime > DRAG_TRANSLATE_THROTTLE_MS &&
        Math.abs(deltaY - this.lastDragTranslateY) >= 2
      ) {
        this.setData({
          dragTranslateY: deltaY
        });
        this.lastDragSetDataTime = now;
        this.lastDragTranslateY = deltaY;
      }
    }
  },

  async onDragEnd() {
    if (!this.data.draggingId) return;
    const mutationOwner = 'drag';
    if (!this.startMemoMutation(mutationOwner)) {
      this.setData({
        draggingId: '',
        dragTranslateY: 0,
        sortOrder: 'desc'
      }, () => this.updateSelectedMemos());
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
        this.setData({
          draggingId: '',
          dragTranslateY: 0,
          sortOrder: 'desc'
        }, () => {
          this.updateSelectedMemos();
        });
        return;
      }

      const nextData = {
        draggingId: '',
        dragTranslateY: 0,
        memoDateMeta: this.updateMemoDateMeta(this.data.memoDateMeta, selectedDate, selectedMemos),
        sortOrder: 'desc'
      };

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
    if (!this.data.draggingId) return;

    this.cardRects = null;
    this.lastDragTranslateY = 0;
    this.setData({
      draggingId: '',
      dragTranslateY: 0,
      sortOrder: 'desc'
    }, () => this.updateSelectedMemos());
  },

  async onSwipeDoneTap(e) {
    const { id } = e.currentTarget.dataset;
    const { selectedDate } = this.data;
    const mutationOwner = `swipe-done:${id}`;
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
