// pages/index/index.js
const { getTranslations } = require('../../utils/i18n.js');
const { formatDate, isValidDateString } = require('../../utils/date.js');
const {
  parseBackupData,
  mergeImportedData,
  cleanMemosUIFields,
  cleanMemoDatesUIFields
} = require('../../utils/backup.js');
const {
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY,
  CATEGORY_PALETTE,
  mergeCategories,
  findCategoryByKey,
  findCategoryByName,
  resolveCategory,
  getNextCategoryColor,
  createCustomCategory
} = require('../../utils/categories.js');

const DEFAULT_FORM = {
  id: '',
  title: '',
  time: '',
  location: '',
  tag: DEFAULT_CATEGORY.key,
  color: DEFAULT_CATEGORY.color,
  notes: '',
  completed: false
};

const STORAGE_KEYS = {
  MEMOS: 'memoCalendarMemos',
  CUSTOM_CATEGORIES: 'memoCustomCategories'
};
const DRAG_TRANSLATE_THROTTLE_MS = 48;
const SWIPE_AUTO_CLOSE_MS = 3000;

Page({
  todayDate: '',
  memoDates: {},

  data: {
    selectedDate: '',
    selectedMemos: [],
    memoDateMeta: {},
    showTodayButton: false,
    lang: 'zh',
    text: getTranslations('zh'),
    modalVisible: false,
    modalClosing: false,
    customCategoryModalVisible: false,
    customCategoryName: '',
    editingCategoryKey: null,
    savingMemo: false,
    savingCategory: false,
    backupModalVisible: false,
    importInputText: '',
    importingData: false,
    exportingData: false,
    categories: DEFAULT_CATEGORIES,
    memoForm: Object.assign({}, DEFAULT_FORM),
    memoNotesLength: 0,
    swipedMemoId: '',
    memoActionId: '',
    draggingId: '',
    dragTranslateY: 0,
    sortOrder: 'desc'
  },

  async onLoad(options) {
    let lang = this.data.lang;
    if (options && options.lang && (options.lang === 'zh' || options.lang === 'en')) {
      lang = options.lang;
    }

    const todayDate = this.getTodayDate();
    this.todayDate = todayDate;

    let selectedDate = todayDate;
    let invalidDateFromOptions = false;
    if (options && options.date) {
      if (isValidDateString(options.date)) {
        selectedDate = options.date;
      } else {
        invalidDateFromOptions = true;
      }
    }

    // Load memos and custom categories from local storage in parallel
    const [memoDates, customCategories] = await Promise.all([
      this.loadMemosFromStorage(),
      this.getStorage(STORAGE_KEYS.CUSTOM_CATEGORIES, []).catch(() => {
        return [];
      })
    ]);
    this.memoDates = memoDates;
    const selectedMemos = cleanMemosUIFields(memoDates[selectedDate] || []);
    const initialMemoDateMeta = this.updateMemoDateMeta({}, selectedDate, selectedMemos);

    this.setData({
      lang,
      text: getTranslations(lang),
      selectedDate,
      selectedMemos,
      showTodayButton: selectedDate !== todayDate,
      memoDateMeta: initialMemoDateMeta,
      categories: mergeCategories(customCategories)
    }, () => {
      // Defer full database calendar indicators scan by 400ms to yield thread completely
      setTimeout(() => {
        this.refreshMemoDateMetaAsync(memoDates);
      }, 400);
      if (invalidDateFromOptions) {
        this.showToast(this.data.text.invalidDate);
      }
    });

    this.updateNavigationTitle(lang);
  },

  onReady() {
    this.calendarCtx = this.selectComponent('#calendar');
  },

  onShow() {
    const todayDate = this.getTodayDate();
    if (todayDate !== this.todayDate) {
      this.todayDate = todayDate;
      this.setData({
        showTodayButton: this.data.selectedDate !== todayDate
      });
    }
  },

  onUnload() {
    this.clearModalCloseTimer();
    this.clearSwipeCloseTimer();
  },

  onShareAppMessage() {
    const { lang, text } = this.data;
    return {
      title: text.shareTitle,
      path: `/pages/index/index?lang=${lang}`
    };
  },

  onShareTimeline() {
    const { lang, text } = this.data;
    return {
      title: text.shareTitle,
      query: `lang=${lang}`
    };
  },

  async loadMemosFromStorage() {
    try {
      const memos = await this.getStorage(STORAGE_KEYS.MEMOS, {});
      return memos || {};
    } catch (e) {
      console.error('Failed to load memos from storage:', e);
      return {};
    }
  },

  getStorage(key, fallbackValue) {
    return new Promise((resolve, reject) => {
      wx.getStorage({
        key,
        success: res => {
          resolve(res.data === undefined ? fallbackValue : res.data);
        },
        fail: err => {
          const errMsg = err && err.errMsg ? err.errMsg : '';
          if (errMsg.indexOf('data not found') !== -1) {
            resolve(fallbackValue);
            return;
          }
          reject(err);
        }
      });
    });
  },

  setStorage(key, data) {
    return new Promise((resolve, reject) => {
      wx.setStorage({
        key,
        data,
        success: () => resolve(true),
        fail: reject
      });
    });
  },

  setClipboardData(data) {
    return new Promise((resolve, reject) => {
      wx.setClipboardData({
        data,
        success: resolve,
        fail: reject
      });
    });
  },

  async getBackupStorageSnapshot() {
    const [memos, categories] = await Promise.all([
      this.getStorage(STORAGE_KEYS.MEMOS, {}),
      this.getStorage(STORAGE_KEYS.CUSTOM_CATEGORIES, [])
    ]);
    return {
      memos: memos || {},
      categories: Array.isArray(categories) ? categories : []
    };
  },

  async rollbackBackupStorage(snapshot) {
    const errors = [];
    await Promise.all([
      this.setStorage(STORAGE_KEYS.CUSTOM_CATEGORIES, snapshot.categories).catch(err => {
        errors.push(err);
      }),
      this.setStorage(STORAGE_KEYS.MEMOS, snapshot.memos).catch(err => {
        errors.push(err);
      })
    ]);

    if (errors.length > 0) {
      console.error('Failed to rollback imported data:', errors);
    }
  },

  async saveImportedDataSafely(finalData, previousData) {
    try {
      await this.setStorage(STORAGE_KEYS.CUSTOM_CATEGORIES, finalData.categories);
      await this.setStorage(STORAGE_KEYS.MEMOS, finalData.memos);
      return true;
    } catch (e) {
      console.error('Failed to save imported data:', e);
      await this.rollbackBackupStorage(previousData);
      this.showStorageFailureToast();
      return false;
    }
  },

  cleanMemoDateUIFields(memoDates, date) {
    const cleanMemoDates = Object.assign({}, memoDates);
    if (Object.prototype.hasOwnProperty.call(cleanMemoDates, date) && Array.isArray(cleanMemoDates[date])) {
      cleanMemoDates[date] = cleanMemosUIFields(cleanMemoDates[date]);
    }
    return cleanMemoDates;
  },

  refreshMemoDateMetaAsync(memoDates = this.memoDates) {
    const source = memoDates || {};
    const dates = Object.keys(source);
    const memoDateMeta = {};
    this.memoDateMetaBuildToken = (this.memoDateMetaBuildToken || 0) + 1;
    const token = this.memoDateMetaBuildToken;

    let index = 0;
    const buildChunk = () => {
      if (this.memoDateMetaBuildToken !== token) return;

      const end = Math.min(index + 60, dates.length);
      for (; index < end; index += 1) {
        const date = dates[index];
        const meta = this.createMemoDateMetaItem(source[date]);
        if (meta.hasMemo) {
          memoDateMeta[date] = meta;
        }
      }

      if (index < dates.length) {
        setTimeout(buildChunk, 0);
        return;
      }

      if (this.memoDates !== source) return;
      this.setData({ memoDateMeta });
    };

    setTimeout(buildChunk, 0);
  },

  createMemoDateMetaItem(dayMemos) {
    if (!Array.isArray(dayMemos) || dayMemos.length === 0) {
      return {
        hasMemo: false,
        memoColors: []
      };
    }

    const memoColors = [];
    for (let i = 0; i < dayMemos.length && memoColors.length < 3; i += 1) {
      const color = dayMemos[i].color || '#fa8231';
      if (memoColors.indexOf(color) === -1) {
        memoColors.push(color);
      }
    }

    return {
      hasMemo: true,
      memoColors
    };
  },

  updateMemoDateMeta(memoDateMeta, date, dayMemos) {
    const nextMeta = Object.assign({}, memoDateMeta);
    const meta = this.createMemoDateMetaItem(dayMemos);
    if (meta.hasMemo) {
      nextMeta[date] = meta;
    } else {
      delete nextMeta[date];
    }
    return nextMeta;
  },

  getFormattedDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${year}${month}${day}-${hours}${minutes}${seconds}${ms}`;
  },

  generateCategoryKey() {
    return `custom-${this.getFormattedDateTime()}`;
  },

  generateMemoId() {
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `memo-${this.getFormattedDateTime()}-${random}`;
  },

  async saveMemosToStorage(memoDates, changedDate = '', options = {}) {
    try {
      const cleanMemoDates = options.changedDateIsClean
        ? memoDates
        : changedDate
        ? this.cleanMemoDateUIFields(memoDates, changedDate)
        : cleanMemoDatesUIFields(memoDates);
      await this.setStorage(STORAGE_KEYS.MEMOS, cleanMemoDates);
      return true;
    } catch (e) {
      console.error('Failed to save memos to storage:', e);
      this.showStorageFailureToast();
      return false;
    }
  },

  showToast(title, icon = 'none') {
    wx.showToast({ title, icon });
  },

  vibrate(type = 'light') {
    wx.vibrateShort({ type, fail: () => {} });
  },

  showStorageFailureToast() {
    this.showToast(this.data.text.storageFailed);
  },

  setBusyState(key, value) {
    this[key] = value;
    this.setData({ [key]: value });
  },

  startBusyState(key) {
    if (this[key]) return false;
    this.setBusyState(key, true);
    return true;
  },

  finishBusyState(key) {
    this.setBusyState(key, false);
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

  startMemoMutation(owner, actionMemoId = '') {
    if (!owner || this.memoMutationLock) return false;
    if (this.data.draggingId && owner !== 'drag') return false;

    this.memoMutationLock = owner;
    this.clearSwipeCloseTimer();
    if (actionMemoId) {
      this.setData({ memoActionId: actionMemoId });
    } else if (this.data.swipedMemoId) {
      this.setData({ swipedMemoId: '' });
    }
    return true;
  },

  releaseMemoMutation(extraData = {}) {
    this.memoMutationLock = '';
    return Object.assign({ memoActionId: '' }, extraData);
  },

  finishMemoMutation(extraData = {}) {
    this.setData(this.releaseMemoMutation(extraData));
  },

  onAddCustomTag() {
    this.vibrate();
    this.setData({
      customCategoryModalVisible: true,
      customCategoryName: '',
      editingCategoryKey: null
    });
  },

  onLongPressTag(e) {
    const { key } = e.currentTarget.dataset;
    const category = this.data.categories.find(c => c.key === key);
    if (!category || !category.isCustom) return;

    this.vibrate('light');
    this.setData({
      editingCategoryKey: key,
      customCategoryName: this.data.lang === 'zh' ? category.labelCn : category.labelEn,
      customCategoryModalVisible: true
    });
  },

  onCustomCategoryNameInput(e) {
    this.data.customCategoryName = e.detail.value;
  },

  onCloseCustomCategoryModal() {
    if (this.savingCategory) return;

    this.vibrate();
    this.setData({
      customCategoryModalVisible: false,
      customCategoryName: '',
      editingCategoryKey: null
    });
  },

  async onSaveCustomCategory() {
    if (this.savingCategory) return;

    const { text, editingCategoryKey } = this.data;
    const content = this.data.customCategoryName ? this.data.customCategoryName.trim() : '';

    if (!content) {
      this.showToast(text.categoryNameEmpty);
      return;
    }

    if (content.length > 10) {
      this.showToast(text.categoryNameTooLong);
      return;
    }

    const existing = findCategoryByName(this.data.categories, content);

    if (existing && (!editingCategoryKey || existing.key !== editingCategoryKey)) {
      this.setData({
        'memoForm.tag': existing.key,
        'memoForm.color': existing.color,
        customCategoryModalVisible: false,
        customCategoryName: '',
        editingCategoryKey: null
      });
      this.showToast(text.categoryExistsSelected);
      return;
    }

    if (!this.startBusyState('savingCategory')) return;

    try {
      const storedCategories = await this.getStorage(STORAGE_KEYS.CUSTOM_CATEGORIES, []);
      const custom = Array.isArray(storedCategories) ? [...storedCategories] : [];
      let selectedCategory;
      let successMessage;

      if (editingCategoryKey) {
        const idx = custom.findIndex(c => c.key === editingCategoryKey);
        if (idx !== -1) {
          custom[idx] = Object.assign({}, custom[idx], {
            labelCn: content,
            labelEn: content
          });
        }
        selectedCategory = custom[idx] || {
          key: editingCategoryKey,
          color: this.data.memoForm.color
        };
        successMessage = text.saved;
      } else {
        selectedCategory = createCustomCategory(
          this.generateCategoryKey(),
          content,
          getNextCategoryColor(custom)
        );
        custom.push(selectedCategory);
        successMessage = text.created;
      }

      await this.setStorage(STORAGE_KEYS.CUSTOM_CATEGORIES, custom);
      this.setData({
        categories: mergeCategories(custom),
        'memoForm.tag': selectedCategory.key,
        'memoForm.color': selectedCategory.color,
        customCategoryModalVisible: false,
        customCategoryName: '',
        editingCategoryKey: null
      });

      this.vibrate('medium');
      this.showToast(successMessage, 'success');
    } catch (e) {
      console.error('Failed to save custom category:', e);
      this.showStorageFailureToast();
    } finally {
      this.finishBusyState('savingCategory');
    }
  },

  onDeleteCustomTag(e) {
    const { key, name } = e.currentTarget.dataset;
    const { text } = this.data;

    this.vibrate('medium');
    this.showConfirm({
      title: text.deleteCategoryTitle,
      content: `${text.deleteCategoryPrefix}${name}${text.deleteCategorySuffix}`,
      confirmColor: '#ef4444',
      confirm: async () => {
        try {
          const custom = await this.getStorage(STORAGE_KEYS.CUSTOM_CATEGORIES, []);
          const updated = custom.filter(c => c.key !== key);
          await this.setStorage(STORAGE_KEYS.CUSTOM_CATEGORIES, updated);

          const nextData = {
            categories: mergeCategories(updated)
          };
          if (this.data.memoForm.tag === key) {
            nextData['memoForm.tag'] = DEFAULT_CATEGORY.key;
            nextData['memoForm.color'] = DEFAULT_CATEGORY.color;
          }
          this.setData(nextData);

          this.vibrate();
          this.showToast(text.deleted, 'success');
        } catch (err) {
          console.error('Failed to delete custom category:', err);
          this.showStorageFailureToast();
        }
      }
    });
  },

  updateSelectedMemos() {
    this.clearSwipeCloseTimer();
    const { selectedDate } = this.data;
    const list = this.memoDates[selectedDate] || [];
    this.setData({
      selectedMemos: cleanMemosUIFields(list),
      swipedMemoId: ''
    });
  },

  async sortByTime() {
    const { selectedMemos, selectedDate, text, sortOrder } = this.data;
    if (!selectedMemos || selectedMemos.length <= 1) return;
    const mutationOwner = 'sort';
    if (!this.startMemoMutation(mutationOwner)) return;

    try {
      const nextOrder = (sortOrder === 'asc') ? 'desc' : 'asc';

      const compareAsc = (a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time);
        if (a.time) return -1;
        if (b.time) return 1;
        return 0;
      };

      const compareDesc = (a, b) => {
        if (a.time && b.time) return b.time.localeCompare(a.time);
        if (a.time) return -1;
        if (b.time) return 1;
        return 0;
      };

      const sorted = [...selectedMemos].sort(nextOrder === 'asc' ? compareAsc : compareDesc);

      const updatedMemoDates = Object.assign({}, this.memoDates);
      updatedMemoDates[selectedDate] = cleanMemosUIFields(sorted);

      if (!await this.saveMemosToStorage(updatedMemoDates, selectedDate, { changedDateIsClean: true })) return;

      this.vibrate();
      this.memoDates = updatedMemoDates;
      this.setData({
        selectedMemos: sorted,
        memoDateMeta: this.updateMemoDateMeta(this.data.memoDateMeta, selectedDate, sorted),
        swipedMemoId: '',
        sortOrder: nextOrder
      }, () => {
        this.showToast(nextOrder === 'asc' ? text.sortAsc : text.sortDesc, 'success');
      });
    } finally {
      if (this.memoMutationLock === mutationOwner) {
        this.releaseMemoMutation();
      }
    }
  },

  toggleLang() {
    const nextLang = this.data.lang === 'zh' ? 'en' : 'zh';
    this.vibrate();
    this.setData({
      lang: nextLang,
      text: getTranslations(nextLang)
    });
    this.updateNavigationTitle(nextLang);
  },

  updateNavigationTitle(lang) {
    wx.setNavigationBarTitle({
      title: getTranslations(lang).navTitle
    });
  },

  getTodayDate() {
    return formatDate(new Date());
  },

  onDateSelect(e) {
    const { date } = e.detail;
    this.selectDate(date);
  },

  goToday() {
    const todayDate = this.getTodayDate();
    const calendar = this.calendarCtx;
    if (calendar && calendar.goToDate) {
      this.vibrate();
      calendar.goToDate(todayDate);
    }

    this.selectDate(todayDate);
  },

  selectDate(date) {
    if (!isValidDateString(date)) {
      this.showToast(this.data.text.invalidDate);
      return;
    }

    const todayDate = this.todayDate || this.getTodayDate();
    this.setData({
      selectedDate: date,
      showTodayButton: date !== todayDate,
      swipedMemoId: '',
      sortOrder: 'desc'
    }, () => {
      this.updateSelectedMemos();
    });
  },

  // Modal Actions
  onAddMemoTap() {
    this.clearModalCloseTimer();
    this.clearSwipeCloseTimer();
    this.vibrate();
    const initialForm = Object.assign({}, DEFAULT_FORM, { id: '' });
    this.originalForm = JSON.stringify(initialForm);
    this.setData({
      memoForm: initialForm,
      memoNotesLength: 0,
      swipedMemoId: '',
      modalVisible: true,
      modalClosing: false
    });
  },

  onEditMemoTap(e) {
    const { id } = e.currentTarget.dataset;
    const { selectedDate, swipedMemoId } = this.data;

    if (swipedMemoId === id) {
      this.closeSwipeActions();
      return;
    }

    const dayMemos = this.memoDates[selectedDate] || [];
    const memo = dayMemos.find(m => m.id === id);
    if (!memo) return;

    this.vibrate();
    this.clearModalCloseTimer();
    this.clearSwipeCloseTimer();
    this.originalForm = JSON.stringify(memo);
    this.setData({
      memoForm: Object.assign({}, memo),
      memoNotesLength: memo.notes ? memo.notes.length : 0,
      swipedMemoId: '',
      modalVisible: true,
      modalClosing: false
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

    // Check if horizontal swipe and minimal vertical move
    if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 40) {
      if (deltaX < 0) {
        this.openSwipeActions(this.activeId);
      } else {
        this.closeSwipeActions();
      }
    }
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
    
    // Query card positions and heights to calculate swaps accurately
    const query = wx.createSelectorQuery();
    query.selectAll('.memo-card-wrapper').boundingClientRect(rects => {
      this.cardRects = rects;
    }).exec();
  },

  onDragMove(e) {
    if (!this.data.draggingId || !this.cardRects) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - this.dragStartY;
    
    // Current dragging card center position
    const currentRect = this.cardRects[this.dragIndex];
    if (!currentRect) return;
    const currentCenterY = currentRect.top + currentRect.height / 2 + deltaY;
    
    // Find if we crossed other card centers
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
      // Swap elements in state
      const list = [...this.data.selectedMemos];
      const draggedItem = list[this.dragIndex];
      
      list.splice(this.dragIndex, 1);
      list.splice(targetIndex, 0, draggedItem);
      
      // Update drag index and start position
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
      // Throttle pure translation updates to reduce bridge traffic during drag.
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

  removeMemoFromDate(memoDates, date, id) {
    const updatedMemoDates = Object.assign({}, memoDates);
    const dayMemos = updatedMemoDates[date] ? [...updatedMemoDates[date]] : [];
    const index = dayMemos.findIndex(m => m.id === id);

    if (index === -1) return null;

    dayMemos.splice(index, 1);
    if (dayMemos.length === 0) {
      delete updatedMemoDates[date];
    } else {
      updatedMemoDates[date] = dayMemos;
    }

    return updatedMemoDates;
  },

  deleteMemoById(id, options = {}) {
    const { selectedDate, text } = this.data;
    const mutationOwner = `delete:${id}`;
    if (!this.startMemoMutation(mutationOwner, id)) return;

    const finishCancelledAction = () => {
      const nextData = options.clearSwipeOnCancel ? { swipedMemoId: '' } : {};
      this.finishMemoMutation(nextData);
    };

    this.showConfirm({
      title: text.confirmDeleteTitle,
      content: text.confirmDelete,
      confirmText: text.delete,
      cancelText: text.cancel,
      confirmColor: '#ef4444',
      confirm: async () => {
        try {
          const updatedMemoDates = this.removeMemoFromDate(this.memoDates, selectedDate, id);
          if (!updatedMemoDates) return;
          if (!await this.saveMemosToStorage(updatedMemoDates, selectedDate)) return;

          if (options.vibrateOnSuccess) {
            this.vibrate('medium');
          }

          this.showToast(text.deleted, 'success');
          this.memoDates = updatedMemoDates;

          const dataToSet = {
            memoDateMeta: this.updateMemoDateMeta(this.data.memoDateMeta, selectedDate, updatedMemoDates[selectedDate]),
            swipedMemoId: ''
          };
          if (this.data.selectedDate === selectedDate) {
            dataToSet.selectedMemos = cleanMemosUIFields(updatedMemoDates[selectedDate] || []);
          }

          if (options.closeModal) {
            const closeData = this.releaseMemoMutation(dataToSet);
            if (!this._closeModalWithData(closeData)) {
              this.setData(closeData);
            }
            return;
          }

          this.finishMemoMutation(dataToSet);
        } finally {
          if (this.memoMutationLock === mutationOwner) {
            this.finishMemoMutation();
            this.restartSwipeAutoClose(id);
          }
        }
      },
      cancel: finishCancelledAction,
      fail: finishCancelledAction
    });
  },

  onSwipeDeleteTap(e) {
    const { id } = e.currentTarget.dataset;
    this.deleteMemoById(id, {
      clearSwipeOnCancel: true
    });
  },

  closeModal() {
    const isDirty = this.originalForm && this.originalForm !== JSON.stringify(this.data.memoForm);
    if (isDirty) {
      this.showConfirm({
        title: this.data.text.discardTitle,
        content: this.data.text.discardChanges,
        confirmText: this.data.text.discard,
        cancelText: this.data.text.continueEditing,
        confirmColor: '#fa8231',
        confirm: () => {
          this._closeModalWithData();
        }
      });
    } else {
      this._closeModalWithData();
    }
  },

  _closeModalWithData(extraData = {}, callback = null) {
    if (!this.data.modalVisible || this.data.modalClosing) return false;

    const dataToSet = Object.assign({ modalClosing: true }, extraData);
    this.setData(dataToSet, () => {
      wx.hideKeyboard({ fail: () => {} });
      if (callback) callback();
      
      this.modalCloseTimer = setTimeout(() => {
        this.modalCloseTimer = null;
        this.setData({
          modalVisible: false,
          modalClosing: false
        });
      }, 160);
    });
    return true;
  },

  clearModalCloseTimer() {
    if (this.modalCloseTimer) {
      clearTimeout(this.modalCloseTimer);
      this.modalCloseTimer = null;
    }
  },



  // Form Inputs
  onFormTitleInput(e) {
    this.data.memoForm.title = e.detail.value;
  },

  onFormCompletedChange(e) {
    this.setData({
      'memoForm.completed': e.detail.value
    });
  },

  onFormLocationInput(e) {
    this.data.memoForm.location = e.detail.value;
  },

  onFormNotesInput(e) {
    const notes = e.detail.value;
    this.data.memoForm.notes = notes;
    this.setData({
      memoNotesLength: notes.length
    });
  },

  onFormTimeChange(e) {
    this.setData({
      'memoForm.time': e.detail.value
    });
  },

  onSelectTag(e) {
    const { key } = e.currentTarget.dataset;
    const category = findCategoryByKey(this.data.categories, key);
    if (!category) return;

    this.vibrate();
    this.setData({
      'memoForm.tag': key,
      'memoForm.color': category.color
    });
  },

  async onSaveMemo() {
    if (this.savingMemo) return;

    const { memoForm, selectedDate, text } = this.data;
    
    if (!memoForm.title.trim()) {
      this.showToast(text.titleRequired);
      return;
    }

    const mutationOwner = 'save-memo';
    if (!this.startMemoMutation(mutationOwner)) return;
    if (!this.startBusyState('savingMemo')) {
      this.releaseMemoMutation();
      return;
    }

    let closeStarted = false;
    try {
      const category = resolveCategory(this.data.categories, memoForm.tag);
      const memoItem = {
        id: memoForm.id || this.generateMemoId(),
        title: memoForm.title.trim(),
        time: memoForm.time,
        location: memoForm.location.trim(),
        tag: memoForm.tag,
        color: memoForm.color || category.color,
        notes: memoForm.notes.trim(),
        tagCn: category.labelCn,
        tagEn: category.labelEn,
        categoryIcon: category.icon,
        completed: memoForm.completed || false
      };

      const updatedMemoDates = Object.assign({}, this.memoDates);
      const dayMemos = updatedMemoDates[selectedDate] ? [...updatedMemoDates[selectedDate]] : [];
      const memoIndex = memoForm.id
        ? dayMemos.findIndex(m => m.id === memoForm.id)
        : -1;
      if (memoIndex === -1) {
        dayMemos.push(memoItem);
      } else {
        dayMemos[memoIndex] = memoItem;
      }

      updatedMemoDates[selectedDate] = dayMemos;
      if (!await this.saveMemosToStorage(updatedMemoDates, selectedDate)) return;

      this.vibrate('medium');
      this.showToast(text.saved, 'success');
      this.memoDates = updatedMemoDates;

      closeStarted = this._closeModalWithData({
        memoDateMeta: this.updateMemoDateMeta(this.data.memoDateMeta, selectedDate, dayMemos)
      }, () => {
        this.updateSelectedMemos();
        this.finishBusyState('savingMemo');
      });
    } finally {
      if (this.memoMutationLock === mutationOwner) {
        this.releaseMemoMutation();
      }
      if (!closeStarted && this.savingMemo) {
        this.finishBusyState('savingMemo');
      }
    }
  },

  onDeleteMemo() {
    const { memoForm } = this.data;
    if (!memoForm.id) return;

    this.deleteMemoById(memoForm.id, {
      closeModal: true,
      vibrateOnSuccess: true
    });
  },

  stopBubble() {
    // Empty handler to prevent event bubbling/scroll penetration
  },

  showConfirm(options) {
    this.vibrate();
    wx.showModal({
      title: options.title || '',
      content: options.content || '',
      confirmText: options.confirmText || this.data.text.confirm,
      cancelText: options.cancelText || this.data.text.cancel,
      confirmColor: options.confirmColor || '#fa8231',
      success: async (res) => {
        const callback = res.confirm
          ? options.confirm
          : (res.cancel ? options.cancel : null);
        if (!callback) return;

        try {
          await callback();
        } catch (err) {
          const action = res.confirm ? 'Confirm' : 'Cancel';
          console.error(`${action} callback failed:`, err);
        }
      },
      fail: (err) => {
        console.error('Failed to show confirm modal:', err);
        if (options.fail) options.fail(err);
      }
    });
  },

  onOpenBackupModal() {
    this.setData({
      backupModalVisible: true,
      importInputText: ''
    });
  },

  onCloseBackupModal() {
    if (this.importingData) return;

    this.setData({
      backupModalVisible: false,
      importInputText: ''
    });
  },

  async onExportData() {
    if (!this.startBusyState('exportingData')) return;

    try {
      const { text: txt } = this.data;
      const snapshot = await this.getBackupStorageSnapshot();

      const backupData = {
        version: 1,
        app: 'MemoCalendar',
        exportAt: new Date().toISOString(),
        memos: snapshot.memos,
        categories: snapshot.categories
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      try {
        await this.setClipboardData(jsonStr);
        this.showToast(txt.copySuccess, 'success');
      } catch (e) {
        console.error('Failed to write export data to clipboard:', e);
        this.showToast(txt.clipboardWriteFailed);
      }
    } catch (e) {
      console.error('Failed to read storage for export:', e);
      this.showStorageFailureToast();
    } finally {
      this.finishBusyState('exportingData');
    }
  },

  onImportFromClipboard() {
    if (!this.startBusyState('importingData')) return;
    const mutationOwner = 'import';
    if (!this.startMemoMutation(mutationOwner)) {
      this.finishBusyState('importingData');
      return;
    }

    const { text: txt } = this.data;
    wx.getClipboardData({
      success: (res) => {
        const text = res.data ? res.data.trim() : '';
        if (!text) {
          this.showToast(txt.clipboardEmpty);
          if (this.memoMutationLock === mutationOwner) {
            this.releaseMemoMutation();
          }
          this.finishBusyState('importingData');
          return;
        }
        // One-click clipboard import always merges for safety
        this.processImportData(text, false, true);
      },
      fail: () => {
        this.showToast(txt.clipboardReadFailed);
        if (this.memoMutationLock === mutationOwner) {
          this.releaseMemoMutation();
        }
        this.finishBusyState('importingData');
      }
    });
  },

  onImportTextInput(e) {
    this.data.importInputText = e.detail.value;
  },

  onTriggerMergeImport() {
    this.triggerImportFromInput(false);
  },

  onTriggerOverwriteImport() {
    this.triggerImportFromInput(true);
  },

  triggerImportFromInput(isOverwrite) {
    if (this.importingData) return;

    const text = this.data.importInputText ? this.data.importInputText.trim() : '';
    if (!text) {
      this.showToast(this.data.text.clipboardEmpty);
      return;
    }

    if (!isOverwrite) {
      this.processImportData(text);
      return;
    }

    this.showConfirm({
      title: this.data.text.confirmOverwriteTitle,
      content: this.data.text.confirmOverwriteDesc,
      confirmColor: '#ef4444',
      confirm: () => {
        this.processImportData(text, true);
      }
    });
  },

  async processImportData(text, isOverwrite = false, lockAcquired = false) {
    const mutationOwner = 'import';
    if (!lockAcquired) {
      if (!this.startBusyState('importingData')) return;
      if (!this.startMemoMutation(mutationOwner)) {
        this.finishBusyState('importingData');
        return;
      }
    }

    const { text: txt } = this.data;
    try {
      const importedData = parseBackupData(text, {
        defaultCategories: DEFAULT_CATEGORIES,
        palette: CATEGORY_PALETTE,
        isValidDateString
      });
      if (!importedData) {
        this.showToast(txt.invalidBackupFormat);
        return;
      }

      let previousData;
      try {
        previousData = await this.getBackupStorageSnapshot();
      } catch (e) {
        console.error('Failed to read storage before import:', e);
        this.showStorageFailureToast();
        return;
      }

      const finalData = isOverwrite
        ? importedData
        : mergeImportedData(importedData, previousData.memos, previousData.categories, {
          palette: CATEGORY_PALETTE
        });

      if (!await this.saveImportedDataSafely(finalData, previousData)) return;

      this.memoDates = finalData.memos;
      const selectedMemos = cleanMemosUIFields(finalData.memos[this.data.selectedDate] || []);
      this.setData({
        categories: mergeCategories(finalData.categories),
        selectedMemos,
        memoDateMeta: this.updateMemoDateMeta({}, this.data.selectedDate, selectedMemos),
        backupModalVisible: false,
        importInputText: ''
      }, () => {
        this.refreshMemoDateMetaAsync(finalData.memos);
        this.showToast(txt.importSuccess, 'success');
      });
    } catch (e) {
      console.error('Failed to import data:', e);
      this.showStorageFailureToast();
    } finally {
      if (this.memoMutationLock === mutationOwner) {
        this.releaseMemoMutation();
      }
      this.finishBusyState('importingData');
    }
  }
});
