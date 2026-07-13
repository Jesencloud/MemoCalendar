const {
  parseBackupData,
  mergeImportedData,
  cleanMemosUIFields
} = require('../../utils/backup.js');
const {
  DEFAULT_CATEGORIES,
  CATEGORY_PALETTE,
  mergeCategories
} = require('../../utils/categories.js');
const { isValidDateString } = require('../../utils/date.js');
const { STORAGE_KEYS } = require('./constants.js');

module.exports = {
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

  finishImportState(mutationOwner) {
    if (this.memoMutationLock === mutationOwner) {
      this.releaseMemoMutation();
    }
    this.finishBusyState('importingData');
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
          this.finishImportState(mutationOwner);
          return;
        }
        // One-click clipboard import always merges for safety
        this.processImportData(text, false, true);
      },
      fail: () => {
        this.showToast(txt.clipboardReadFailed);
        this.finishImportState(mutationOwner);
      }
    });
  },

  onImportTextInput(e) {
    this.setData({
      importInputText: e.detail.value
    });
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
      this.processImportData(text, false);
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
      this.finishImportState(mutationOwner);
    }
  }
};
