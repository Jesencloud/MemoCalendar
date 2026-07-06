// components/calendar/calendar.js
const { t } = require('../../utils/i18n.js');
const { CHINA_HOLIDAYS_2026 } = require('../../data/china_holidays.js');

const SWIPER_CENTER_INDEX = 1;
const SWIPER_DURATION_MS = 220;

function getCalendarText(lang) {
  return {
    weekdays: t('weekdays', lang)
  };
}

Component({
  calendarSwipeAnimating: false,

  properties: {
    lang: {
      type: String,
      value: 'zh'
    },
    selectedDate: {
      type: String,
      value: '',
      observer(newVal) {
        if (newVal && newVal !== this.data.selectedDate && this.data.currentYear) {
          this.goToDate(newVal);
        }
      }
    },
    memoDateMeta: {
      type: Object,
      value: {},
      observer(newVal) {
        if (this.data.currentYear) {
          this.setData(this.getCalendarState(this.data.currentYear, this.data.currentMonth, this.data.selectedDate, this.data.viewMode));
        }
      }
    }
  },

  data: {
    swiperPanels: [],
    currentMonth: 0,
    currentYear: 0,
    selectedDate: '',
    swiperCurrent: SWIPER_CENTER_INDEX,
    swiperDuration: SWIPER_DURATION_MS,
    weekdays: [],
    viewMode: 'month',
    activeRowIdx: 0,
    rowCount: 6
  },

  lifetimes: {
    attached() {
      const now = new Date();
      const defaultDate = this.formatDate(now.getFullYear(), now.getMonth(), now.getDate());
      const parsedInitialDate = this.parseDate(this.properties.selectedDate);
      const initialDate = parsedInitialDate ? this.properties.selectedDate : defaultDate;
      const parsed = parsedInitialDate || { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
      const currentYear = parsed.year;
      const currentMonth = parsed.month;
      const locale = getCalendarText(this.data.lang);
      const calendarState = this.getCalendarState(currentYear, currentMonth, initialDate, 'month');
      this.setData({
        currentYear,
        currentMonth,
        selectedDate: initialDate,
        weekdays: locale.weekdays,
        viewMode: 'month',
        ...calendarState
      });
    }
  },

  methods: {
    getCalendarState(currentYear, currentMonth, selectedDate, viewMode) {
      const now = new Date();
      const todayDate = this.formatDate(now.getFullYear(), now.getMonth(), now.getDate());
      let rowCount = 1;
      if (viewMode === 'month') {
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        rowCount = Math.ceil((firstDay + daysInMonth) / 7);
      }
      if (viewMode === 'week') {
        const prevWeekDate = this.getShiftedWeekDate(selectedDate, -1);
        const nextWeekDate = this.getShiftedWeekDate(selectedDate, 1);
        const swiperPanels = [
          {
            key: `week-prev-${prevWeekDate}`,
            days: this.createWeekDays(prevWeekDate, todayDate)
          },
          {
            key: `week-current-${selectedDate}`,
            days: this.createWeekDays(selectedDate, todayDate)
          },
          {
            key: `week-next-${nextWeekDate}`,
            days: this.createWeekDays(nextWeekDate, todayDate)
          }
        ];
        return { swiperPanels, activeRowIdx: 0, rowCount: 1 };
      } else {
        const prevMonth = this.getShiftedMonth(currentYear, currentMonth, -1);
        const nextMonth = this.getShiftedMonth(currentYear, currentMonth, 1);
        const currentDays = this.createMonthDays(currentYear, currentMonth, todayDate);
        const swiperPanels = [
          {
            key: `prev-${prevMonth.year}-${prevMonth.month}`,
            days: this.createMonthDays(prevMonth.year, prevMonth.month, todayDate)
          },
          {
            key: `current-${currentYear}-${currentMonth}`,
            days: currentDays
          },
          {
            key: `next-${nextMonth.year}-${nextMonth.month}`,
            days: this.createMonthDays(nextMonth.year, nextMonth.month, todayDate)
          }
        ];
        let activeRowIdx = 0;
        const idx = currentDays.findIndex(d => d.fullDate === selectedDate);
        if (idx !== -1) {
          activeRowIdx = Math.floor(idx / 7);
        }
        return { swiperPanels, activeRowIdx, rowCount };
      }
    },

    createMonthDays(year, month, todayDate) {
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const days = [];
      for (let i = 0; i < firstDay; i++) {
        days.push({
          day: '',
          fullDate: '',
          dateKey: `empty-before-${year}-${month}-${i}`,
          hasMemo: false
        });
      }
      const memoDateMeta = this.data.memoDateMeta || {};
      for (let i = 1; i <= daysInMonth; i++) {
        days.push(this.createDayItem(new Date(year, month, i), todayDate, memoDateMeta));
      }
      return days;
    },

    createWeekDays(baseDateStr, todayDate) {
      const baseDate = this.parseDate(baseDateStr);
      if (!baseDate) return [];
      const dateObj = new Date(baseDate.year, baseDate.month, baseDate.day);
      const dayOfWeek = dateObj.getDay(); // 0 is Sunday
      const days = [];
      const memoDateMeta = this.data.memoDateMeta || {};
      for (let i = 0; i < 7; i++) {
        const d = new Date(baseDate.year, baseDate.month, baseDate.day - dayOfWeek + i);
        days.push(this.createDayItem(d, todayDate, memoDateMeta));
      }
      return days;
    },

    createDayItem(date, todayDate, memoDateMeta) {
      const fullDate = this.formatDate(date.getFullYear(), date.getMonth(), date.getDate());
      const meta = memoDateMeta[fullDate] || {};
      return {
        day: date.getDate(),
        fullDate,
        dateKey: fullDate,
        hasMemo: meta.hasMemo === true,
        memoColors: Array.isArray(meta.memoColors) ? meta.memoColors : [],
        isPast: fullDate < todayDate,
        holidayInfo: CHINA_HOLIDAYS_2026[fullDate] || null
      };
    },

    formatDate(year, month, day) {
      const m = month + 1;
      const mm = m < 10 ? '0' + m : m;
      const dd = day < 10 ? '0' + day : day;
      return `${year}-${mm}-${dd}`;
    },

    parseDate(date) {
      if (typeof date !== 'string') return null;
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      const parsed = new Date(year, month, day);
      if (
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month ||
        parsed.getDate() !== day
      ) {
        return null;
      }
      return {
        year,
        month,
        day
      };
    },

    getShiftedMonth(year, month, offset) {
      const date = new Date(year, month + offset, 1);
      return {
        year: date.getFullYear(),
        month: date.getMonth()
      };
    },

    getShiftedWeekDate(dateStr, offset) {
      const parsed = this.parseDate(dateStr);
      if (!parsed) return dateStr;
      const d = new Date(parsed.year, parsed.month, parsed.day + offset * 7);
      return this.formatDate(d.getFullYear(), d.getMonth(), d.getDate());
    },

    vibrate() {
      wx.vibrateShort({ type: 'light', fail: () => {} });
    },

    goToDate(date) {
      const parsedDate = this.parseDate(date);
      if (!parsedDate) return;
      this.setData({
        currentYear: parsedDate.year,
        currentMonth: parsedDate.month,
        selectedDate: date,
        swiperCurrent: SWIPER_CENTER_INDEX,
        swiperDuration: 0,
        ...this.getCalendarState(parsedDate.year, parsedDate.month, date, this.data.viewMode)
      }, () => this.restoreSwiperDuration());
    },

    onMonthPickerChange(e) {
      const val = e.detail.value;
      if (!val) return;
      const parts = val.split('-');
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1; // 0-indexed month
      if (Number.isNaN(year) || Number.isNaN(month)) return;
      const selectedDate = this.getAutoSelectedDate(year, month);
      this.setData({
        currentMonth: month,
        currentYear: year,
        selectedDate,
        swiperCurrent: SWIPER_CENTER_INDEX,
        swiperDuration: 0,
        ...this.getCalendarState(year, month, selectedDate, 'month')
      }, () => {
        this.calendarSwipeAnimating = false;
        this.restoreSwiperDuration();
        this.triggerEvent('selectdate', { date: selectedDate });
      });
    },

    onCalendarSwiperFinish(e) {
      const current = e.detail && typeof e.detail.current === 'number'
        ? e.detail.current
        : SWIPER_CENTER_INDEX;
      if (current === SWIPER_CENTER_INDEX) return;
      const offset = current > SWIPER_CENTER_INDEX ? 1 : -1;
      this.calendarSwipeAnimating = true;
      if (this.data.viewMode === 'week') {
        this.changeWeek(offset, { autoSelectDate: true, resetSwiper: true });
      } else {
        this.changeMonth(offset, { autoSelectDate: true, resetSwiper: true });
      }
    },

    restoreSwiperDuration() {
      if (this.data.swiperDuration === SWIPER_DURATION_MS) return;
      this.setData({ swiperDuration: SWIPER_DURATION_MS });
    },

    slideCalendar(offset) {
      if (this.calendarSwipeAnimating) return;
      this.calendarSwipeAnimating = true;
      this.setData({
        swiperCurrent: offset > 0 ? SWIPER_CENTER_INDEX + 1 : SWIPER_CENTER_INDEX - 1,
        swiperDuration: SWIPER_DURATION_MS
      });
    },

    getAutoSelectedDate(year, month) {
      let day = 1;
      const currentSelected = this.data.selectedDate;
      const parsed = this.parseDate(currentSelected);
      if (parsed) {
        day = parsed.day;
      } else {
        day = new Date().getDate();
      }
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const targetDay = Math.min(day, daysInMonth);
      return this.formatDate(year, month, targetDay);
    },

    changeMonth(offset, options = {}) {
      const shiftedMonth = this.getShiftedMonth(
        this.data.currentYear,
        this.data.currentMonth,
        offset
      );
      const currentYear = shiftedMonth.year;
      const currentMonth = shiftedMonth.month;
      const selectedDate = options.autoSelectDate
        ? this.getAutoSelectedDate(currentYear, currentMonth)
        : this.data.selectedDate;
      const nextData = {
        currentMonth,
        currentYear,
        selectedDate,
        ...this.getCalendarState(currentYear, currentMonth, selectedDate, 'month')
      };
      if (options.resetSwiper) {
        nextData.swiperCurrent = SWIPER_CENTER_INDEX;
        nextData.swiperDuration = 0;
      }
      this.setData(nextData, () => {
        this.calendarSwipeAnimating = false;
        if (options.autoSelectDate) {
          this.triggerEvent('selectdate', { date: selectedDate });
        }
      });
    },

    changeWeek(offset, options = {}) {
      const { selectedDate } = this.data;
      const nextSelectedDate = this.getShiftedWeekDate(selectedDate, offset);
      const parsed = this.parseDate(nextSelectedDate);
      if (!parsed) {
        this.calendarSwipeAnimating = false;
        return;
      }
      const nextData = {
        selectedDate: nextSelectedDate,
        currentYear: parsed.year,
        currentMonth: parsed.month,
        ...this.getCalendarState(parsed.year, parsed.month, nextSelectedDate, 'week')
      };
      if (options.resetSwiper) {
        nextData.swiperCurrent = SWIPER_CENTER_INDEX;
        nextData.swiperDuration = 0;
      }
      this.setData(nextData, () => {
        this.calendarSwipeAnimating = false;
        if (options.autoSelectDate) {
          this.triggerEvent('selectdate', { date: nextSelectedDate });
        }
      });
    },

    prevMonth() {
      this.slideCalendar(-1);
    },

    nextMonth() {
      this.slideCalendar(1);
    },

    selectDay(e) {
      const { date } = e.currentTarget.dataset;
      if (!date) return;
      this.vibrate();
      const parsed = this.parseDate(date);
      if (!parsed) return;
      const nextState = {
        selectedDate: date,
        currentYear: parsed.year,
        currentMonth: parsed.month
      };
      if (this.data.viewMode === 'week') {
        Object.assign(nextState, this.getCalendarState(parsed.year, parsed.month, date, 'week'));
      } else {
        const { swiperPanels } = this.data;
        const currentDays = swiperPanels[SWIPER_CENTER_INDEX].days;
        const idx = currentDays.findIndex(d => d.fullDate === date);
        if (idx !== -1) {
          nextState.activeRowIdx = Math.floor(idx / 7);
        }
      }
      this.setData(nextState, () => {
        this.triggerEvent('selectdate', { date });
      });
    },

    onTouchStart() {
      if (this.data.swiperDuration !== SWIPER_DURATION_MS) {
        this.setData({ swiperDuration: SWIPER_DURATION_MS });
      }
    },

    // Gesture Handlers for Folding/Unfolding
    onCalendarTouchStart(e) {
      if (e.touches.length === 1) {
        this.touchStartY = e.touches[0].clientY;
        this.touchStartX = e.touches[0].clientX;
        this.touchMoveY = null;
        this.touchMoveX = null;
      }
    },

    onCalendarTouchMove(e) {
      if (e.touches.length === 1) {
        this.touchMoveY = e.touches[0].clientY;
        this.touchMoveX = e.touches[0].clientX;
      }
    },

    onCalendarTouchEnd() {
      if (this.touchStartY !== null && this.touchMoveY !== null) {
        const deltaY = this.touchMoveY - this.touchStartY;
        const deltaX = this.touchMoveX - this.touchStartX;
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 40) {
          if (deltaY < 0 && this.data.viewMode !== 'week') {
            this.toggleViewMode('week');
          } else if (deltaY > 0 && this.data.viewMode !== 'month') {
            this.toggleViewMode('month');
          }
        }
      }
      this.touchStartY = null;
      this.touchMoveY = null;
    },

    toggleViewMode(targetMode) {
      const mode = (typeof targetMode === 'string')
        ? targetMode
        : (this.data.viewMode === 'month' ? 'week' : 'month');
      this.vibrate();
      const { currentYear, currentMonth, selectedDate } = this.data;
      const nextState = this.getCalendarState(currentYear, currentMonth, selectedDate, mode);
      this.setData({
        viewMode: mode,
        ...nextState
      });
    }
  },

  observers: {
    'lang': function(lang) {
      const locale = getCalendarText(lang);
      this.setData({
        weekdays: locale.weekdays
      });
    }
  }
});
