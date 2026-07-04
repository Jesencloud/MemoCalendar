// pages/index/index.js
const { t } = require('../../utils/i18n.js');

const CATEGORIES = [
  { key: 'Sport', labelCn: '运动', labelEn: 'Sport', color: '#ff9500', icon: '🏋' },
  { key: 'Travel', labelCn: '旅行', labelEn: 'Travel', color: '#32ade6', icon: '✈️' },
  { key: 'Social', labelCn: '社交', labelEn: 'Social', color: '#ff2d55', icon: '🥂' },
  { key: 'Pet', labelCn: '宠物', labelEn: 'Pet', color: '#a2845e', icon: '🐶' },
  { key: 'Beauty', labelCn: '美容', labelEn: 'Beauty', color: '#af52de', icon: '💆🏻‍♀️' },
  { key: 'Shopping', labelCn: '购物', labelEn: 'Shopping', color: '#007aff', icon: '🛍️' },
  { key: 'Food', labelCn: '美食', labelEn: 'Food', color: '#ffcc00', icon: '🍽️' },
  { key: 'Health', labelCn: '健康', labelEn: 'Health', color: '#34c759', icon: '💊' },
  { key: 'Gaming', labelCn: '游戏', labelEn: 'Gaming', color: '#5856d6', icon: '🎮' },
  { key: 'Study', labelCn: '学习', labelEn: 'Study', color: '#30b0c7', icon: '📚' },
  { key: 'Family', labelCn: '家庭', labelEn: 'Family', color: '#00c7be', icon: '🍼' },
  { key: 'Finance', labelCn: '财务', labelEn: 'Finance', color: '#8e8e93', icon: '💰' },
  { key: 'Reading', labelCn: '阅读', labelEn: 'Reading', color: '#d09a04', icon: '📖' },
  { key: 'Hobby', labelCn: '爱好', labelEn: 'Hobby', color: '#b25c24', icon: '🎳️' },
  { key: 'Important', labelCn: '重要', labelEn: 'Important', color: '#ff3b30', icon: '❗' }
];

const PALETTE = [
  '#ff3b30', // Apple Red
  '#ff9500', // Apple Orange
  '#ffcc00', // Apple Yellow
  '#34c759', // Apple Green
  '#00c7be', // Apple Mint
  '#30b0c7', // Apple Teal
  '#32ade6', // Apple Cyan
  '#007aff', // Apple Blue
  '#5856d6', // Apple Indigo
  '#af52de', // Apple Purple
  '#ff2d55', // Apple Pink
  '#a2845e', // Apple Brown
  '#8e8e93'  // Apple Gray
];

const DEFAULT_FORM = {
  id: '',
  title: '',
  time: '',
  location: '',
  tag: 'Sport',
  color: '#ff9500',
  notes: '',
  completed: false
};

function getText(lang) {
  const keys = [
    'title',
    'subtitle',
    'shareTitle',
    'today',
    'events',
    'noEvents',
    'langToggle',
    'addMemo',
    'editMemo',
    'delete',
    'done',
    'todo',
    'save',
    'saved',
    'cancel',
    'confirm',
    'created',
    'deleted',
    'storageFailed',
    'inputTitlePlaceholder',
    'inputTimePlaceholder',
    'inputLocationPlaceholder',
    'inputNotesPlaceholder',
    'selectCategory',
    'customCategory',
    'newCustomCategory',
    'customCategoryPlaceholder',
    'categoryNameEmpty',
    'categoryNameTooLong',
    'categoryExistsSelected',
    'deleteCategoryTitle',
    'deleteCategoryPrefix',
    'deleteCategorySuffix',
    'confirmDeleteTitle',
    'confirmDelete',
    'discardTitle',
    'discardChanges',
    'discard',
    'continueEditing',
    'titleRequired',
    'invalidDate',
    'sortAsc',
    'sortDesc',
    'markCompleted',
    'time',
    'location',
    'notes',
    'backupBtn',
    'dataBackupTitle',
    'exportData',
    'exportDesc',
    'copyBackupData',
    'importData',
    'importDesc',
    'importFromClipboard',
    'manualPasteLabel',
    'pastePlaceholder',
    'mergeImport',
    'overwriteImport',
    'copySuccess',
    'clipboardEmpty',
    'clipboardReadFailed',
    'invalidBackupFormat',
    'importSuccess',
    'confirmOverwriteTitle',
    'confirmOverwriteDesc'
  ];
  return keys.reduce((text, key) => {
    text[key] = t(key, lang);
    return text;
  }, {});
}

Page({
  todayDate: '',

  data: {
    selectedDate: '',
    selectedMemos: [],
    memoDates: {}, // Structure: { 'YYYY-MM-DD': [ { id, title, time, location, tag, color, notes, tagCn, tagEn, categoryIcon } ] }
    showTodayButton: false,
    lang: 'zh',
    text: getText('zh'),
    modalVisible: false,
    modalClosing: false,
    customCategoryModalVisible: false,
    customCategoryName: '',
    backupModalVisible: false,
    importInputText: '',
    confirmDialog: {
      visible: false,
      title: '',
      content: '',
      confirmText: '',
      cancelText: '',
      confirmColor: ''
    },
    categories: CATEGORIES,
    memoForm: Object.assign({}, DEFAULT_FORM),
    memoNotesLength: 0,
    swipedMemoId: '',
    draggingId: '',
    dragTranslateY: 0,
    sortOrder: 'desc'
  },

  onLoad(options) {
    let lang = this.data.lang;
    if (options && options.lang && (options.lang === 'zh' || options.lang === 'en')) {
      lang = options.lang;
    }

    const todayDate = this.getTodayDate();
    this.todayDate = todayDate;

    let selectedDate = todayDate;
    let invalidDateFromOptions = false;
    if (options && options.date) {
      if (this.isValidDateString(options.date)) {
        selectedDate = options.date;
      } else {
        invalidDateFromOptions = true;
      }
    }

    // Load memos from local storage
    const memoDates = this.loadMemosFromStorage();

    this.setData({
      lang,
      text: getText(lang),
      selectedDate,
      showTodayButton: selectedDate !== todayDate,
      memoDates
    }, () => {
      this.updateSelectedMemos();
      if (invalidDateFromOptions) {
        wx.showToast({
          title: this.data.text.invalidDate,
          icon: 'none'
        });
      }
    });

    this.updateNavigationTitle(lang);
  },

  onReady() {
    this.calendarCtx = this.selectComponent('#calendar');
    // Load custom categories after initial page paint completes
    this.loadCategories();
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

  loadMemosFromStorage() {
    try {
      const memos = wx.getStorageSync('memoCalendarMemos');
      return memos || {};
    } catch (e) {
      console.error('Failed to load memos from storage:', e);
      return {};
    }
  },

  cleanMemosUIFields(memos) {
    if (!Array.isArray(memos)) return [];
    return memos.map(item => {
      const cleanItem = Object.assign({}, item);
      delete cleanItem.isSwiped;
      return cleanItem;
    });
  },

  cleanMemoDatesUIFields(memoDates) {
    const cleanMemoDates = {};
    Object.keys(memoDates || {}).forEach(date => {
      const list = memoDates[date];
      cleanMemoDates[date] = Array.isArray(list) ? this.cleanMemosUIFields(list) : list;
    });
    return cleanMemoDates;
  },

  saveMemosToStorage(memoDates) {
    try {
      wx.setStorageSync('memoCalendarMemos', this.cleanMemoDatesUIFields(memoDates));
      return true;
    } catch (e) {
      console.error('Failed to save memos to storage:', e);
      this.showStorageFailureToast();
      return false;
    }
  },

  showStorageFailureToast() {
    wx.showToast({
      title: this.data.text.storageFailed,
      icon: 'none'
    });
  },

  loadCategories() {
    try {
      const custom = wx.getStorageSync('memoCustomCategories') || [];
      this.setData({
        categories: [...CATEGORIES, ...custom]
      });
    } catch (e) {
      console.error('Failed to load custom categories:', e);
      this.setData({
        categories: CATEGORIES
      });
    }
  },

  onAddCustomTag() {
    wx.vibrateShort({ type: 'light', fail: () => {} });
    this.setData({
      customCategoryModalVisible: true,
      customCategoryName: ''
    });
  },

  onCustomCategoryNameInput(e) {
    this.data.customCategoryName = e.detail.value;
  },

  onCloseCustomCategoryModal() {
    wx.vibrateShort({ type: 'light', fail: () => {} });
    this.setData({
      customCategoryModalVisible: false,
      customCategoryName: ''
    });
  },

  onSaveCustomCategory() {
    const { text } = this.data;
    const content = this.data.customCategoryName ? this.data.customCategoryName.trim() : '';

    if (!content) {
      wx.showToast({
        title: text.categoryNameEmpty,
        icon: 'none'
      });
      return;
    }

    if (content.length > 10) {
      wx.showToast({
        title: text.categoryNameTooLong,
        icon: 'none'
      });
      return;
    }

    // Check duplicate
    const existing = this.data.categories.find(
      c => c.labelCn.toLowerCase() === content.toLowerCase() ||
           c.labelEn.toLowerCase() === content.toLowerCase()
    );

    if (existing) {
      this.setData({
        'memoForm.tag': existing.key,
        'memoForm.color': existing.color,
        customCategoryModalVisible: false,
        customCategoryName: ''
      });
      wx.showToast({
        title: text.categoryExistsSelected,
        icon: 'none'
      });
      return;
    }

    let custom = [];
    try {
      custom = wx.getStorageSync('memoCustomCategories') || [];
    } catch (e) {
      console.error('Failed to read custom categories:', e);
      this.showStorageFailureToast();
      return;
    }

    const selectedColor = PALETTE[custom.length % PALETTE.length];
    const newCategory = {
      key: `custom-${Date.now()}`,
      labelCn: content,
      labelEn: content,
      color: selectedColor,
      icon: '🏷️',
      isCustom: true
    };

    custom.push(newCategory);
    try {
      wx.setStorageSync('memoCustomCategories', custom);
    } catch (e) {
      console.error('Failed to save custom category:', e);
      this.showStorageFailureToast();
      return;
    }

    this.loadCategories();

    this.setData({
      'memoForm.tag': newCategory.key,
      'memoForm.color': newCategory.color,
      customCategoryModalVisible: false,
      customCategoryName: ''
    });

    wx.vibrateShort({ type: 'medium', fail: () => {} });
    wx.showToast({
      title: text.created,
      icon: 'success'
    });
  },

  onDeleteCustomTag(e) {
    const { key, name } = e.currentTarget.dataset;
    const { text } = this.data;

    wx.vibrateShort({ type: 'medium', fail: () => {} });
    this.showConfirm({
      title: text.deleteCategoryTitle,
      content: `${text.deleteCategoryPrefix}${name}${text.deleteCategorySuffix}`,
      confirmColor: '#ef4444',
      confirm: () => {
        try {
          const custom = wx.getStorageSync('memoCustomCategories') || [];
          const updated = custom.filter(c => c.key !== key);
          wx.setStorageSync('memoCustomCategories', updated);

          // Reload categories
          this.loadCategories();

          // If the deleted category was currently selected, reset it to Sport
          if (this.data.memoForm.tag === key) {
            this.setData({
              'memoForm.tag': 'Sport',
              'memoForm.color': '#ff9500'
            });
          }

          wx.vibrateShort({ type: 'light', fail: () => {} });
          wx.showToast({
            title: text.deleted,
            icon: 'success'
          });
        } catch (err) {
          console.error('Failed to delete custom category:', err);
          this.showStorageFailureToast();
        }
      }
    });
  },

  updateSelectedMemos() {
    const { selectedDate, memoDates } = this.data;
    const list = memoDates[selectedDate] || [];
    this.setData({
      selectedMemos: this.cleanMemosUIFields(list),
      swipedMemoId: ''
    });
  },

  sortByTime() {
    const { selectedMemos, selectedDate, memoDates, text, sortOrder } = this.data;
    if (!selectedMemos || selectedMemos.length <= 1) return;

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

    const updatedMemoDates = Object.assign({}, memoDates);
    updatedMemoDates[selectedDate] = this.cleanMemosUIFields(sorted);

    if (!this.saveMemosToStorage(updatedMemoDates)) return;

    wx.vibrateShort({ type: 'light', fail: () => {} });
    
    this.setData({
      selectedMemos: sorted,
      memoDates: updatedMemoDates,
      swipedMemoId: '',
      sortOrder: nextOrder
    }, () => {
      wx.showToast({
        title: nextOrder === 'asc' ? text.sortAsc : text.sortDesc,
        icon: 'success'
      });
    });
  },

  toggleLang() {
    const nextLang = this.data.lang === 'zh' ? 'en' : 'zh';
    wx.vibrateShort({ type: 'light', fail: () => {} });
    this.setData({
      lang: nextLang,
      text: getText(nextLang)
    }, () => {
      this.updateSelectedMemos();
    });
    this.updateNavigationTitle(nextLang);
  },

  updateNavigationTitle(lang) {
    wx.setNavigationBarTitle({
      title: t('navTitle', lang)
    });
  },

  getTodayDate() {
    return this.formatDate(new Date());
  },

  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  isValidDateString(date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) return false;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(year, month - 1, day);

    return parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day;
  },

  onDateSelect(e) {
    const { date } = e.detail;
    this.selectDate(date);
  },

  goToday() {
    const todayDate = this.getTodayDate();
    const calendar = this.calendarCtx;
    if (calendar && calendar.goToDate) {
      wx.vibrateShort({ type: 'light', fail: () => {} });
      calendar.goToDate(todayDate);
    }

    this.selectDate(todayDate);
  },

  selectDate(date) {
    if (!this.isValidDateString(date)) {
      wx.showToast({
        title: this.data.text.invalidDate,
        icon: 'none'
      });
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
    wx.vibrateShort({ type: 'light', fail: () => {} });
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
    const { selectedDate, memoDates, swipedMemoId } = this.data;

    if (swipedMemoId === id) {
      this.setData({ swipedMemoId: '' });
      return;
    }

    const dayMemos = memoDates[selectedDate] || [];
    const memo = dayMemos.find(m => m.id === id);
    if (!memo) return;

    wx.vibrateShort({ type: 'light', fail: () => {} });
    this.clearModalCloseTimer();
    this.originalForm = JSON.stringify(memo);
    this.setData({
      memoForm: Object.assign({}, memo),
      memoNotesLength: memo.notes ? memo.notes.length : 0,
      modalVisible: true,
      modalClosing: false
    });
  },

  onSwipeTouchStart(e) {
    const touch = e.touches[0];
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.activeId = e.currentTarget.dataset.id;
  },

  onSwipeTouchEnd(e) {
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - this.startX;
    const deltaY = touch.clientY - this.startY;

    // Check if horizontal swipe and minimal vertical move
    if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 40) {
      this.setData({
        swipedMemoId: deltaX < 0 ? this.activeId : ''
      });
    }
  },

  onDragStart(e) {
    const { id, index } = e.currentTarget.dataset;
    const touch = e.touches[0];
    
    this.dragStartY = touch.clientY;
    this.dragIndex = index;
    this.lastDragSetDataTime = 0;
    
    wx.vibrateShort({ type: 'light', fail: () => {} });
    
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
      
      wx.vibrateShort({ type: 'light', fail: () => {} });
    } else {
      // Throttle pure translation updates to ~30fps (approx. every 32ms)
      const now = Date.now();
      if (now - this.lastDragSetDataTime > 32) {
        this.setData({
          dragTranslateY: deltaY
        });
        this.lastDragSetDataTime = now;
      }
    }
  },

  onDragEnd() {
    if (!this.data.draggingId) return;
    
    const { selectedMemos, selectedDate, memoDates } = this.data;
    
    const updatedMemoDates = Object.assign({}, memoDates);
    updatedMemoDates[selectedDate] = this.cleanMemosUIFields(selectedMemos);

    const saveSucceeded = this.saveMemosToStorage(updatedMemoDates);
    if (!saveSucceeded) {
      this.setData({
        draggingId: '',
        dragTranslateY: 0,
        sortOrder: 'desc'
      }, () => {
        this.updateSelectedMemos();
      });
      this.cardRects = null;
      return;
    }

    const nextData = {
      draggingId: '',
      dragTranslateY: 0,
      memoDates: updatedMemoDates,
      sortOrder: 'desc'
    };

    this.setData(nextData);
    
    this.cardRects = null;
    wx.vibrateShort({ type: 'medium', fail: () => {} });
  },

  onSwipeDoneTap(e) {
    const { id } = e.currentTarget.dataset;
    const { selectedDate, memoDates } = this.data;
    
    wx.vibrateShort({ type: 'light', fail: () => {} });
    
    const updatedMemoDates = Object.assign({}, memoDates);
    const dayMemos = (updatedMemoDates[selectedDate] || []).map(item => {
      const cleanItem = Object.assign({}, item);
      if (cleanItem.id === id) {
        cleanItem.completed = !cleanItem.completed;
      }
      return cleanItem;
    });
    
    updatedMemoDates[selectedDate] = this.cleanMemosUIFields(dayMemos);

    if (!this.saveMemosToStorage(updatedMemoDates)) return;

    this.setData({
      memoDates: updatedMemoDates
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
    const { selectedDate, memoDates, text } = this.data;
    if (!id) return;

    this.showConfirm({
      title: text.confirmDeleteTitle,
      content: text.confirmDelete,
      confirmText: text.delete,
      cancelText: text.cancel,
      confirmColor: '#ef4444',
      confirm: () => {
        const updatedMemoDates = this.removeMemoFromDate(memoDates, selectedDate, id);
        if (!updatedMemoDates) return;
        if (!this.saveMemosToStorage(updatedMemoDates)) return;

        if (options.vibrateOnSuccess) {
          wx.vibrateShort({ type: 'medium', fail: () => {} });
        }

        wx.showToast({
          title: text.deleted,
          icon: 'success'
        });

        const dataToSet = {
          memoDates: updatedMemoDates,
          swipedMemoId: ''
        };

        if (options.closeModal) {
          this._closeModalWithData(dataToSet, () => {
            this.updateSelectedMemos();
          });
          return;
        }

        this.setData(dataToSet, () => {
          this.updateSelectedMemos();
        });
      },
      cancel: () => {
        if (options.clearSwipeOnCancel) {
          this.setData({ swipedMemoId: '' });
        }
      }
    });
  },

  onSwipeDeleteTap(e) {
    const { id } = e.currentTarget.dataset;

    wx.vibrateShort({ type: 'medium', fail: () => {} });
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
        confirmColor: '#d09a04',
        confirm: () => {
          this._closeModalWithData();
        }
      });
    } else {
      this._closeModalWithData();
    }
  },

  _closeModalWithData(extraData = {}, callback = null) {
    if (!this.data.modalVisible || this.data.modalClosing) return;

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
    const category = this.data.categories.find(c => c.key === key);
    if (!category) return;

    wx.vibrateShort({ type: 'light', fail: () => {} });
    this.setData({
      'memoForm.tag': key,
      'memoForm.color': category.color
    });
  },

  onSaveMemo() {
    if (this.savingMemo) return;

    const { memoForm, selectedDate, memoDates, text } = this.data;
    
    if (!memoForm.title.trim()) {
      wx.showToast({
        title: text.titleRequired,
        icon: 'none'
      });
      return;
    }

    this.savingMemo = true;

    const category = this.data.categories.find(c => c.key === memoForm.tag) || this.data.categories[0] || CATEGORIES[0];
    
    const memoItem = {
      id: memoForm.id || `memo-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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

    const updatedMemoDates = Object.assign({}, memoDates);
    const dayMemos = updatedMemoDates[selectedDate] ? [...updatedMemoDates[selectedDate]] : [];

    if (memoForm.id) {
      // Edit existing
      const index = dayMemos.findIndex(m => m.id === memoForm.id);
      if (index !== -1) {
        dayMemos[index] = memoItem;
      } else {
        dayMemos.push(memoItem);
      }
    } else {
      // Add new
      dayMemos.push(memoItem);
    }

    updatedMemoDates[selectedDate] = dayMemos;

    if (!this.saveMemosToStorage(updatedMemoDates)) {
      this.savingMemo = false;
      return;
    }

    wx.vibrateShort({ type: 'medium', fail: () => {} });
    wx.showToast({
      title: text.saved,
      icon: 'success'
    });

    this._closeModalWithData({ memoDates: updatedMemoDates }, () => {
      this.updateSelectedMemos();
      this.savingMemo = false;
    });
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
    this.confirmCallback = options.confirm || null;
    this.cancelCallback = options.cancel || null;

    this.setData({
      confirmDialog: {
        visible: true,
        title: options.title || '',
        content: options.content || '',
        confirmText: options.confirmText || this.data.text.confirm,
        cancelText: options.cancelText || this.data.text.cancel,
        confirmColor: options.confirmColor || '#ef4444'
      }
    });
  },

  onConfirmDialogConfirm() {
    this.setData({
      'confirmDialog.visible': false
    }, () => {
      const callback = this.confirmCallback;
      this.confirmCallback = null;
      this.cancelCallback = null;

      try {
        if (callback) callback();
      } finally {
        this.confirmCallback = null;
        this.cancelCallback = null;
      }
    });
  },

  onConfirmDialogCancel() {
    this.setData({
      'confirmDialog.visible': false
    }, () => {
      const callback = this.cancelCallback;
      this.confirmCallback = null;
      this.cancelCallback = null;

      try {
        if (callback) callback();
      } finally {
        this.confirmCallback = null;
        this.cancelCallback = null;
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
    this.setData({
      backupModalVisible: false,
      importInputText: ''
    });
  },

  onExportData() {
    const { text: txt } = this.data;
    let memos = {};
    let categories = [];
    try {
      memos = wx.getStorageSync('memoCalendarMemos') || {};
      categories = wx.getStorageSync('memoCustomCategories') || [];
    } catch (e) {
      console.error('Failed to read storage for export:', e);
      this.showStorageFailureToast();
      return;
    }

    const backupData = {
      version: 1,
      app: 'MemoCalendar',
      exportAt: new Date().toISOString(),
      memos,
      categories
    };

    const jsonStr = JSON.stringify(backupData);
    wx.setClipboardData({
      data: jsonStr,
      success: () => {
        wx.showToast({
          title: txt.copySuccess,
          icon: 'success'
        });
      }
    });
  },

  onImportFromClipboard() {
    const { text: txt } = this.data;
    wx.getClipboardData({
      success: (res) => {
        const text = res.data ? res.data.trim() : '';
        if (!text) {
          wx.showToast({
            title: txt.clipboardEmpty,
            icon: 'none'
          });
          return;
        }
        // One-click clipboard import always merges for safety
        this.processImportData(text, false);
      },
      fail: () => {
        wx.showToast({
          title: txt.clipboardReadFailed,
          icon: 'none'
        });
      }
    });
  },

  onImportTextInput(e) {
    this.data.importInputText = e.detail.value;
  },

  onTriggerMergeImport() {
    const text = this.data.importInputText ? this.data.importInputText.trim() : '';
    if (!text) {
      wx.showToast({
        title: this.data.text.clipboardEmpty,
        icon: 'none'
      });
      return;
    }
    this.processImportData(text, false);
  },

  onTriggerOverwriteImport() {
    const text = this.data.importInputText ? this.data.importInputText.trim() : '';
    if (!text) {
      wx.showToast({
        title: this.data.text.clipboardEmpty,
        icon: 'none'
      });
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

  processImportData(text, isOverwrite = false) {
    const { text: txt } = this.data;
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      wx.showToast({
        title: txt.invalidBackupFormat,
        icon: 'none'
      });
      return;
    }

    if (!data || data.app !== 'MemoCalendar' || !data.memos) {
      wx.showToast({
        title: txt.invalidBackupFormat,
        icon: 'none'
      });
      return;
    }

    const importedMemos = data.memos;
    const importedCategories = data.categories || [];

    let finalMemos = {};
    let finalCategories = [];

    if (isOverwrite) {
      finalMemos = importedMemos;
      finalCategories = importedCategories;
    } else {
      // Merge
      let localMemos = {};
      let localCategories = [];
      try {
        localMemos = wx.getStorageSync('memoCalendarMemos') || {};
        localCategories = wx.getStorageSync('memoCustomCategories') || [];
      } catch (e) {
        console.error('Failed to read storage for merge:', e);
        this.showStorageFailureToast();
        return;
      }

      finalMemos = Object.assign({}, localMemos);
      for (const date in importedMemos) {
        if (!finalMemos[date]) {
          finalMemos[date] = importedMemos[date];
        } else {
          const localDayMemos = [...finalMemos[date]];
          const importedDayMemos = importedMemos[date];

          importedDayMemos.forEach(importedItem => {
            const index = localDayMemos.findIndex(m => m.id === importedItem.id);
            if (index !== -1) {
              localDayMemos[index] = importedItem;
            } else {
              localDayMemos.push(importedItem);
            }
          });
          finalMemos[date] = localDayMemos;
        }
      }

      finalCategories = [...localCategories];
      importedCategories.forEach(importedCat => {
        if (importedCat.key && importedCat.key.startsWith('custom-')) {
          const exists = finalCategories.some(c => c.key === importedCat.key);
          if (!exists) {
            finalCategories.push(importedCat);
          }
        }
      });
    }

    try {
      wx.setStorageSync('memoCalendarMemos', finalMemos);
      wx.setStorageSync('memoCustomCategories', finalCategories);
    } catch (e) {
      console.error('Failed to save imported data:', e);
      this.showStorageFailureToast();
      return;
    }

    this.loadCategories();
    this.setData({
      memoDates: finalMemos,
      backupModalVisible: false,
      importInputText: ''
    }, () => {
      this.updateSelectedMemos();
      wx.showToast({
        title: txt.importSuccess,
        icon: 'success'
      });
    });
  }
});
