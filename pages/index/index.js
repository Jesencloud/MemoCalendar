// pages/index/index.js
const { getTranslations } = require('../../utils/i18n.js');
const { formatDate, isValidDateString } = require('../../utils/date.js');
const { cleanMemosUIFields, cleanMemoDatesUIFields } = require('../../utils/memos.js');
const {
  DEFAULT_CATEGORIES,
  CATEGORY_PALETTE,
  findCategoryByKey,
  mergeCategories
} = require('../../utils/categories.js');
const { mergeImportedData } = require('../../utils/backup.js');
const {
  MAX_SHARE_PATH_LENGTH,
  createSharedMemoPayload,
  parseSharedMemoPayload,
  createSharedMemoImportForSave,
  getSharedMemoSaveState,
  removeMemoByIdFromDates
} = require('../../utils/share.js');
const { STORAGE_KEYS, DEFAULT_FORM } = require('./constants.js');

const gestureHandlers = require('./gestureHandlers.js');
const formHandlers = require('./formHandlers.js');
const backupHandlers = require('./backupHandlers.js');
const shareImageHandlers = require('./shareImageHandlers.js');

Page(Object.assign({
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
    sharePreviewVisible: false,
    sharedMemoDate: '',
    sharedMemo: null,
    sharedMemoSaveStatus: 'new',
    sharedMemoChangedFields: {},
    savingSharedMemo: false,
    categories: DEFAULT_CATEGORIES,
    memoForm: Object.assign({}, DEFAULT_FORM),
    memoNotesLength: 0,
    swipedMemoId: '',
    memoActionId: '',
    draggingId: '',
    dragTranslateY: 0,
    dragPreviewReady: false,
    dragPreviewTop: 0,
    dragPreviewLeft: 0,
    dragPreviewWidth: 0,
    dragPreviewHeight: 0,
    sortOrder: 'desc'
  },

  async onLoad(options) {
    const optionLang = options && (options.lang === 'zh' || options.lang === 'en')
      ? options.lang
      : '';

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

    let sharedMemoImport = null;
    let invalidShareFromOptions = false;
    if (options && options.share) {
      sharedMemoImport = this.parseSharedMemoOption(options.share);
      if (sharedMemoImport) {
        selectedDate = sharedMemoImport.date;
      } else {
        invalidShareFromOptions = true;
      }
    }

    // Load memos and custom categories from local storage in parallel
    const [memoDates, customCategories, storedLang] = await Promise.all([
      this.loadMemosFromStorage(),
      this.getStorage(STORAGE_KEYS.CUSTOM_CATEGORIES, []).catch(() => {
        return [];
      }),
      this.getStorage(STORAGE_KEYS.LANGUAGE, '').catch(() => '')
    ]);
    const lang = storedLang === 'zh' || storedLang === 'en'
      ? storedLang
      : (optionLang || this.data.lang);
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
      // Defer full scan by 400ms to yield thread completely
      setTimeout(() => {
        this.refreshMemoDateMetaAsync(memoDates);
      }, 400);
      if (invalidDateFromOptions) {
        this.showToast(this.data.text.invalidDate);
      }
      if (invalidShareFromOptions) {
        this.showToast(this.data.text.invalidBackupFormat);
      }
      if (sharedMemoImport) {
        this.showSharedMemoPreview(sharedMemoImport);
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
    this.clearMemoNotesCountTimer();
    this.clearSwipeCloseTimer();
    this.stopDragAutoScroll();
    this.clearMemoShareImageCache();
  },

  getDefaultShareConfig() {
    const { text } = this.data;
    return {
      title: text.shareTitle,
      path: '/pages/index/index'
    };
  },

  findMemoForShare(date, id) {
    if (!isValidDateString(date) || !id) return null;
    const dayMemos = this.memoDates[date] || [];
    return dayMemos.find(memo => memo.id === id) || null;
  },

  createMemoShareTitle(memo, date) {
    const { text } = this.data;
    const titleParts = [date];
    if (memo.time) titleParts.push(memo.time);
    titleParts.push(memo.title);
    return `${text.shareMemoTitlePrefix}${titleParts.join(' ')}`.slice(0, 80);
  },

  onShareAppMessage(e) {
    const defaultConfig = this.getDefaultShareConfig();
    if (!e || e.from !== 'button') return defaultConfig;

    const dataset = e.target && e.target.dataset ? e.target.dataset : {};
    const { date, id } = dataset;
    const memo = this.findMemoForShare(date, id);
    if (!memo) return defaultConfig;

    const category = findCategoryByKey(this.data.categories, memo.tag);
    let payload = createSharedMemoPayload(date, memo, category);
    let path = `/pages/index/index?share=${payload}`;
    if (payload && path.length > MAX_SHARE_PATH_LENGTH && memo.notes) {
      payload = createSharedMemoPayload(date, memo, category, { includeNotes: false });
      path = `/pages/index/index?share=${payload}`;
    }

    if (!payload || path.length > MAX_SHARE_PATH_LENGTH) {
      this.showToast(this.data.text.shareDataTooLong);
      return defaultConfig;
    }

    const shareConfig = {
      title: this.createMemoShareTitle(memo, date),
      path
    };
    if (typeof this.createMemoShareImage !== 'function') return shareConfig;

    return Object.assign({}, shareConfig, {
      promise: this.createMemoShareImage(date, memo)
        .then(imageUrl => {
          return imageUrl ? Object.assign({}, shareConfig, { imageUrl }) : shareConfig;
        })
        .catch(error => {
          console.error('Failed to create memo share image:', error);
          return shareConfig;
        })
    });
  },

  onShareTimeline() {
    const { text } = this.data;
    return {
      title: text.shareTitle
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

  generateCategoryKey() {
    return `custom-${Date.now()}`;
  },

  generateMemoId() {
    return `memo-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  },

  async saveMemosToStorage(memoDates, changedDate = '', options = {}) {
    try {
      let cleanMemoDates;
      if (options.changedDateIsClean) {
        cleanMemoDates = memoDates;
      } else if (changedDate) {
        cleanMemoDates = Object.assign({}, memoDates);
        if (Array.isArray(cleanMemoDates[changedDate])) {
          cleanMemoDates[changedDate] = cleanMemosUIFields(cleanMemoDates[changedDate]);
        }
      } else {
        cleanMemoDates = cleanMemoDatesUIFields(memoDates);
      }
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

  parseSharedMemoOption(share) {
    return parseSharedMemoPayload(share, {
      defaultCategories: DEFAULT_CATEGORIES,
      palette: CATEGORY_PALETTE,
      isValidDateString
    });
  },

  showSharedMemoPreview(sharedMemoImport) {
    const saveState = getSharedMemoSaveState(sharedMemoImport, this.memoDates);
    this.sharedMemoImport = sharedMemoImport;
    this.setData({
      sharePreviewVisible: true,
      sharedMemoDate: sharedMemoImport.date,
      sharedMemo: sharedMemoImport.memo,
      sharedMemoSaveStatus: saveState ? saveState.status : 'new',
      sharedMemoChangedFields: saveState && saveState.changedFields
        ? saveState.changedFields
        : {},
      swipedMemoId: ''
    });
  },

  closeSharedMemoPreview(extraData = {}, callback = null) {
    this.sharedMemoImport = null;
    this.setData(Object.assign({
      sharePreviewVisible: false,
      sharedMemoDate: '',
      sharedMemo: null,
      sharedMemoSaveStatus: 'new',
      sharedMemoChangedFields: {}
    }, extraData), callback);
  },

  onCloseSharePreview() {
    if (this.savingSharedMemo) return;
    this.closeSharedMemoPreview();
  },

  async onSaveSharedMemo() {
    if (!this.sharedMemoImport || !this.startBusyState('savingSharedMemo')) return;

    const sharedMemoImport = this.sharedMemoImport;
    const { text: txt } = this.data;
    try {
      let previousData;
      try {
        previousData = await this.getBackupStorageSnapshot();
      } catch (e) {
        this.showStorageFailureToast();
        return;
      }

      const importedData = createSharedMemoImportForSave(sharedMemoImport);
      if (!importedData) {
        this.showToast(txt.invalidBackupFormat);
        return;
      }

      const saveState = getSharedMemoSaveState(sharedMemoImport, previousData.memos);
      if (!saveState) {
        this.showToast(txt.invalidBackupFormat);
        return;
      }
      if (saveState.status === 'unchanged') {
        this.closeSharedMemoPreview({}, () => {
          this.showToast(txt.sharedMemoAlreadySaved);
        });
        return;
      }

      const baseMemos = saveState.status === 'changed'
        ? removeMemoByIdFromDates(previousData.memos, sharedMemoImport.memo.id)
        : previousData.memos;

      const finalData = mergeImportedData(importedData, baseMemos, previousData.categories, {
        palette: CATEGORY_PALETTE
      });

      if (!await this.saveImportedDataSafely(finalData, previousData)) return;

      this.memoDates = finalData.memos;
      const selectedDate = sharedMemoImport.date;
      const selectedMemos = cleanMemosUIFields(finalData.memos[selectedDate] || []);
      const todayDate = this.todayDate || this.getTodayDate();

      this.closeSharedMemoPreview({
        selectedDate,
        selectedMemos,
        categories: mergeCategories(finalData.categories),
        showTodayButton: selectedDate !== todayDate,
        memoDateMeta: this.updateMemoDateMeta({}, selectedDate, selectedMemos),
        swipedMemoId: ''
      }, () => {
        this.refreshMemoDateMetaAsync(finalData.memos);
        const message = saveState.status === 'changed'
          ? txt.sharedMemoReplaced
          : txt.sharedMemoAdded;
        this.showToast(message, 'success');
      });
    } finally {
      this.finishBusyState('savingSharedMemo');
    }
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
    this.setStorage(STORAGE_KEYS.LANGUAGE, nextLang).catch(() => {});
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

    this.clearSwipeCloseTimer();
    const todayDate = this.todayDate || this.getTodayDate();
    const list = this.memoDates[date] || [];
    this.setData({
      selectedDate: date,
      selectedMemos: cleanMemosUIFields(list),
      showTodayButton: date !== todayDate,
      swipedMemoId: '',
      sortOrder: 'desc'
    });
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

  stopBubble() {
    // Empty handler to prevent event bubbling/scroll penetration
  }
}, gestureHandlers, formHandlers, backupHandlers, shareImageHandlers));
