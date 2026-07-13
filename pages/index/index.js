// pages/index/index.js
const { getTranslations } = require('../../utils/i18n.js');
const { formatDate, isValidDateString } = require('../../utils/date.js');
const { cleanMemosUIFields, cleanMemoDatesUIFields } = require('../../utils/backup.js');
const {
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY,
  mergeCategories
} = require('../../utils/categories.js');
const {
  MAX_SHARE_PATH_LENGTH,
  createSharedMemoPayload,
  parseSharedMemoPayload,
  createSharedMemoImportForSave
} = require('../../utils/share.js');

const gestureHandlers = require('./gestureHandlers.js');
const formHandlers = require('./formHandlers.js');
const backupHandlers = require('./backupHandlers.js');

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
    savingSharedMemo: false,
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
    this.clearSwipeCloseTimer();
  },

  getDefaultShareConfig() {
    const { lang, text } = this.data;
    return {
      title: text.shareTitle,
      path: `/pages/index/index?lang=${lang}`
    };
  },

  findMemoForShare(date, id) {
    if (!this.isValidDateString(date) || !id) return null;
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
    let path = `/pages/index/index?lang=${this.data.lang}&share=${payload}`;
    if (payload && path.length > MAX_SHARE_PATH_LENGTH && memo.notes) {
      payload = createSharedMemoPayload(date, memo, category, { includeNotes: false });
      path = `/pages/index/index?lang=${this.data.lang}&share=${payload}`;
    }

    if (!payload || path.length > MAX_SHARE_PATH_LENGTH) {
      this.showToast(this.data.text.shareDataTooLong);
      return defaultConfig;
    }

    return {
      title: this.createMemoShareTitle(memo, date),
      path
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

  parseSharedMemoOption(share) {
    return parseSharedMemoPayload(share, {
      defaultCategories: DEFAULT_CATEGORIES,
      palette: CATEGORY_PALETTE,
      isValidDateString: this.isValidDateString.bind(this)
    });
  },

  showSharedMemoPreview(sharedMemoImport) {
    this.sharedMemoImport = sharedMemoImport;
    this.setData({
      sharePreviewVisible: true,
      sharedMemoDate: sharedMemoImport.date,
      sharedMemo: sharedMemoImport.memo,
      swipedMemoId: ''
    });
  },

  onCloseSharePreview() {
    if (this.savingSharedMemo) return;

    this.sharedMemoImport = null;
    this.setData({
      sharePreviewVisible: false,
      sharedMemoDate: '',
      sharedMemo: null
    });
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

      const importedData = createSharedMemoImportForSave(
        sharedMemoImport,
        previousData.memos,
        this.generateMemoId.bind(this)
      );
      if (!importedData) {
        this.showToast(txt.invalidBackupFormat);
        return;
      }

      const finalData = mergeImportedData(importedData, previousData.memos, previousData.categories, {
        palette: CATEGORY_PALETTE
      });

      if (!await this.saveImportedDataSafely(finalData, previousData)) return;

      this.memoDates = finalData.memos;
      const selectedDate = sharedMemoImport.date;
      const selectedMemos = cleanMemosUIFields(finalData.memos[selectedDate] || []);
      const todayDate = this.todayDate || this.getTodayDate();

      this.sharedMemoImport = null;
      this.setData({
        selectedDate,
        selectedMemos,
        categories: mergeCategories(finalData.categories),
        showTodayButton: selectedDate !== todayDate,
        memoDateMeta: this.updateMemoDateMeta({}, selectedDate, selectedMemos),
        sharePreviewVisible: false,
        sharedMemoDate: '',
        sharedMemo: null,
        swipedMemoId: ''
      }, () => {
        this.refreshMemoDateMetaAsync(finalData.memos);
        this.showToast(txt.sharedMemoAdded, 'success');
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
}, gestureHandlers, formHandlers, backupHandlers));
