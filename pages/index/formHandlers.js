const {
  findCategoryByKey,
  findCategoryByName,
  mergeCategories,
  getNextCategoryColor,
  createCustomCategory,
  resolveCategory
} = require('../../utils/categories.js');
const { cleanMemosUIFields } = require('../../utils/backup.js');
const { DEFAULT_FORM, STORAGE_KEYS, DEFAULT_CATEGORY } = require('./constants.js');

module.exports = {
  onAddMemoTap() {
    this.vibrate();
    this.clearModalCloseTimer();
    this.clearSwipeCloseTimer();
    this.originalForm = JSON.stringify(DEFAULT_FORM);
    this.setData({
      memoForm: Object.assign({}, DEFAULT_FORM),
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

    const memo = (this.memoDates[selectedDate] || []).find(item => item.id === id);
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
    const notes = e.detail.value;
    this.setData({
      'memoForm.notes': notes,
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

      const closeData = {
        memoDateMeta: this.updateMemoDateMeta(this.data.memoDateMeta, selectedDate, dayMemos),
        swipedMemoId: ''
      };
      if (this.data.selectedDate === selectedDate) {
        closeData.selectedMemos = cleanMemosUIFields(dayMemos);
      }
      closeStarted = this._closeModalWithData(closeData, () => {
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
    const category = findCategoryByKey(this.data.categories, key);
    if (!category || !category.isCustom) return;

    this.vibrate('light');
    this.setData({
      editingCategoryKey: key,
      customCategoryName: this.data.lang === 'zh' ? category.labelCn : category.labelEn,
      customCategoryModalVisible: true
    });
  },

  onCustomCategoryNameInput(e) {
    this.setData({
      customCategoryName: e.detail.value
    });
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
  }
};
