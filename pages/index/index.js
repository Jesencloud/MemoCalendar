// pages/index/index.js
const { t } = require('../../utils/i18n.js');

const CATEGORIES = [
  { key: 'Sport', labelCn: '运动', labelEn: 'Sport', color: '#ff9500', icon: '🏋' },
  { key: 'Travel', labelCn: '旅行', labelEn: 'Travel', color: '#30b0c7', icon: '✈️' },
  { key: 'Social', labelCn: '社交', labelEn: 'Social', color: '#ff2d55', icon: '🥂' },
  { key: 'Pet', labelCn: '宠物', labelEn: 'Pet', color: '#ffcc00', icon: '🐶' },
  { key: 'Beauty', labelCn: '美容', labelEn: 'Beauty', color: '#ff2d55', icon: '💆🏻‍♀️' },
  { key: 'Shopping', labelCn: '购物', labelEn: 'Shopping', color: '#af52de', icon: '🛍️' },
  { key: 'Food', labelCn: '美食', labelEn: 'Food', color: '#00c7be', icon: '🍽️' },
  { key: 'Health', labelCn: '健康', labelEn: 'Health', color: '#34c759', icon: '💊' },
  { key: 'Gaming', labelCn: '游戏', labelEn: 'Gaming', color: '#ff453a', icon: '🎮' },
  { key: 'Study', labelCn: '学习', labelEn: 'Study', color: '#5856d6', icon: '📚' },
  { key: 'Family', labelCn: '家庭', labelEn: 'Family', color: '#ff9500', icon: '🍼' },
  { key: 'Finance', labelCn: '财务', labelEn: 'Finance', color: '#30b0c7', icon: '💰' },
  { key: 'Reading', labelCn: '阅读', labelEn: 'Reading', color: '#d09a04', icon: '📖' },
  { key: 'Hobby', labelCn: '爱好', labelEn: 'Hobby', color: '#af52de', icon: '🎳️' },
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
    'today',
    'events',
    'noEvents',
    'langToggle',
    'addMemo',
    'editMemo',
    'delete',
    'save',
    'cancel',
    'ok',
    'inputTitlePlaceholder',
    'inputTimePlaceholder',
    'inputLocationPlaceholder',
    'inputNotesPlaceholder',
    'selectCategory',
    'confirmDelete',
    'titleRequired',
    'invalidDate',
    'sortByTime'
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
    categories: CATEGORIES,
    memoForm: Object.assign({}, DEFAULT_FORM),
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
    if (options && options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
      selectedDate = options.date;
    }

    // Load memos from local storage
    const memoDates = this.loadMemosFromStorage();

    // Load custom categories
    this.loadCategories();

    this.setData({
      lang,
      text: getText(lang),
      selectedDate,
      showTodayButton: selectedDate !== todayDate,
      memoDates
    }, () => {
      this.updateSelectedMemos();
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
  },

  onShareAppMessage() {
    const { lang } = this.data;
    const title = lang === 'zh' ? '备忘录日历 - 记录日程规划生活' : 'Memo Calendar - Track schedule & plan life';
    return {
      title,
      path: `/pages/index/index?lang=${lang}`
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
    } catch (e) {
      console.error('Failed to save memos to storage:', e);
      wx.showToast({
        title: this.data.lang === 'zh' ? '存储失败' : 'Storage failed',
        icon: 'none'
      });
    }
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
    const { lang } = this.data;
    wx.vibrateShort({ type: 'light', fail: () => {} });
    wx.showModal({
      title: lang === 'zh' ? '新建自定义分类' : 'New Custom Category',
      placeholderText: lang === 'zh' ? '输入分类名称 (10字以内)' : 'Category name (max 10 chars)',
      editable: true,
      success: (res) => {
        if (res.confirm) {
          const content = res.content ? res.content.trim() : '';
          if (!content) {
            wx.showToast({
              title: lang === 'zh' ? '分类名称不能为空' : 'Name cannot be empty',
              icon: 'none'
            });
            return;
          }

          if (content.length > 10) {
            wx.showToast({
              title: lang === 'zh' ? '长度超出10个字' : 'Too long (max 10 chars)',
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
              'memoForm.color': existing.color
            });
            wx.showToast({
              title: lang === 'zh' ? '分类已存在，已为你自动选中' : 'Category exists, selected',
              icon: 'none'
            });
            return;
          }

          const custom = wx.getStorageSync('memoCustomCategories') || [];
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
          wx.setStorageSync('memoCustomCategories', custom);
          this.loadCategories();

          this.setData({
            'memoForm.tag': newCategory.key,
            'memoForm.color': newCategory.color
          });

          wx.vibrateShort({ type: 'medium', fail: () => {} });
          wx.showToast({
            title: lang === 'zh' ? '创建成功' : 'Created',
            icon: 'success'
          });
        }
      }
    });
  },

  onDeleteCustomTag(e) {
    const { key, name } = e.currentTarget.dataset;
    const { lang } = this.data;

    wx.vibrateShort({ type: 'medium', fail: () => {} });
    wx.showModal({
      title: lang === 'zh' ? '删除分类' : 'Delete Category',
      content: lang === 'zh' ? `确定要删除自定义分类“${name}”吗？` : `Are you sure you want to delete custom category "${name}"?`,
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
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
              title: lang === 'zh' ? '已删除' : 'Deleted',
              icon: 'success'
            });
          } catch (err) {
            console.error('Failed to delete custom category:', err);
          }
        }
      }
    });
  },

  updateSelectedMemos() {
    const { selectedDate, memoDates } = this.data;
    const list = memoDates[selectedDate] || [];
    // Deep clone each memo item to isolate runtime UI state from cache
    // Explicitly seed isSwiped: false to prevent WeChat's diff engine from caching swipe open state
    const clonedList = list.map(item => Object.assign({ isSwiped: false }, item));
    this.setData({
      selectedMemos: clonedList
    });
  },

  sortByTime() {
    const { selectedMemos, selectedDate, memoDates, lang, sortOrder } = this.data;
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
    
    this.saveMemosToStorage(updatedMemoDates);
    wx.vibrateShort({ type: 'light', fail: () => {} });
    
    this.setData({
      selectedMemos: sorted,
      memoDates: updatedMemoDates,
      sortOrder: nextOrder
    }, () => {
      wx.showToast({
        title: lang === 'zh' 
          ? (nextOrder === 'asc' ? '时间正序' : '时间倒序') 
          : (nextOrder === 'asc' ? 'Sorted Ascending' : 'Sorted Descending'),
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
    const todayDate = this.todayDate || this.getTodayDate();
    this.setData({
      selectedDate: date,
      showTodayButton: date !== todayDate,
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
      modalVisible: true,
      modalClosing: false
    });
  },

  onEditMemoTap(e) {
    const { id } = e.currentTarget.dataset;
    const { selectedDate, memoDates, selectedMemos } = this.data;
    const memoUI = selectedMemos.find(m => m.id === id);
    
    // If swiped, click resets the swipe state instead of opening editor
    if (memoUI && memoUI.isSwiped) {
      const updated = selectedMemos.map(item => {
        if (item.id === id) {
          item.isSwiped = false;
        }
        return item;
      });
      this.setData({ selectedMemos: updated });
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
      const { selectedMemos } = this.data;
      const updated = selectedMemos.map(item => {
        if (item.id === this.activeId) {
          if (deltaX < 0) {
            item.isSwiped = true;
          } else {
            item.isSwiped = false;
          }
        } else {
          item.isSwiped = false;
        }
        return item;
      });
      this.setData({ selectedMemos: updated });
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
      dragTranslateY: 0
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
    this.saveMemosToStorage(updatedMemoDates);
    
    this.setData({
      draggingId: '',
      dragTranslateY: 0,
      memoDates: updatedMemoDates,
      sortOrder: 'desc'
    });
    
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
    this.saveMemosToStorage(updatedMemoDates);
    
    this.setData({
      memoDates: updatedMemoDates
    }, () => {
      this.updateSelectedMemos();
    });
  },

  onSwipeDeleteTap(e) {
    const { id } = e.currentTarget.dataset;
    const { selectedDate, memoDates, lang, text } = this.data;
    
    wx.vibrateShort({ type: 'medium', fail: () => {} });
    
    wx.showModal({
      title: lang === 'zh' ? '确认删除' : 'Confirm Delete',
      content: text.confirmDelete,
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          const updatedMemoDates = Object.assign({}, memoDates);
          const dayMemos = updatedMemoDates[selectedDate] ? [...updatedMemoDates[selectedDate]] : [];
          const index = dayMemos.findIndex(m => m.id === id);
          
          if (index !== -1) {
            dayMemos.splice(index, 1);
            if (dayMemos.length === 0) {
              delete updatedMemoDates[selectedDate];
            } else {
              updatedMemoDates[selectedDate] = dayMemos;
            }

            this.saveMemosToStorage(updatedMemoDates);
            
            wx.showToast({
              title: lang === 'zh' ? '已删除' : 'Deleted',
              icon: 'success'
            });

            this.setData({
              memoDates: updatedMemoDates
            }, () => {
              this.updateSelectedMemos();
            });
          }
        } else {
          // Reset swipe state on cancel
          const { selectedMemos } = this.data;
          const updated = selectedMemos.map(item => {
            if (item.id === id) {
              item.isSwiped = false;
            }
            return item;
          });
          this.setData({ selectedMemos: updated });
        }
      }
    });
  },

  closeModal() {
    const isDirty = this.originalForm && this.originalForm !== JSON.stringify(this.data.memoForm);
    if (isDirty) {
      wx.showModal({
        title: this.data.lang === 'zh' ? '提示' : 'Tip',
        content: this.data.lang === 'zh' ? '有未保存的修改，确定放弃并退出吗？' : 'Discard unsaved changes?',
        confirmText: this.data.lang === 'zh' ? '放弃' : 'Discard',
        cancelText: this.data.lang === 'zh' ? '继续编辑' : 'Keep Editing',
        confirmColor: '#d09a04',
        success: (res) => {
          if (res.confirm) {
            this._closeModalWithData();
          }
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
    this.setData({
      'memoForm.title': e.detail.value
    });
  },

  onFormCompletedChange(e) {
    this.setData({
      'memoForm.completed': e.detail.value
    });
  },

  onFormLocationInput(e) {
    this.setData({
      'memoForm.location': e.detail.value
    });
  },

  onFormNotesInput(e) {
    this.setData({
      'memoForm.notes': e.detail.value
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
    const { memoForm, selectedDate, memoDates, lang, text } = this.data;
    
    if (!memoForm.title.trim()) {
      wx.showToast({
        title: text.titleRequired,
        icon: 'none'
      });
      return;
    }

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

    this.saveMemosToStorage(updatedMemoDates);

    wx.vibrateShort({ type: 'medium', fail: () => {} });
    wx.showToast({
      title: lang === 'zh' ? '保存成功' : 'Saved',
      icon: 'success'
    });

    this._closeModalWithData({ memoDates: updatedMemoDates }, () => {
      this.updateSelectedMemos();
    });
  },

  onDeleteMemo() {
    const { memoForm, selectedDate, memoDates, lang, text } = this.data;
    if (!memoForm.id) return;

    wx.showModal({
      title: lang === 'zh' ? '确认删除' : 'Confirm Delete',
      content: text.confirmDelete,
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          const updatedMemoDates = Object.assign({}, memoDates);
          const dayMemos = updatedMemoDates[selectedDate] ? [...updatedMemoDates[selectedDate]] : [];
          const index = dayMemos.findIndex(m => m.id === memoForm.id);
          
          if (index !== -1) {
            dayMemos.splice(index, 1);
            if (dayMemos.length === 0) {
              delete updatedMemoDates[selectedDate];
            } else {
              updatedMemoDates[selectedDate] = dayMemos;
            }

            this.saveMemosToStorage(updatedMemoDates);
            
            wx.vibrateShort({ type: 'medium', fail: () => {} });
            wx.showToast({
              title: lang === 'zh' ? '已删除' : 'Deleted',
              icon: 'success'
            });

            this._closeModalWithData({ memoDates: updatedMemoDates }, () => {
              this.updateSelectedMemos();
            });
          }
        }
      }
    });
  }
});
