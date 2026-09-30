export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  label: string;
}

export function parseDatePreset(preset?: string | null, customFrom?: string | null, customTo?: string | null, now: Date = new Date()): DateRange {
  
  // Format YYYY-MM-DD
  const fmt = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const todayStr = fmt(now);

  if (customFrom && customTo) {
    return {
      startDate: customFrom,
      endDate: customTo,
      label: `${customFrom} - ${customTo}`,
    };
  }

  switch (preset) {
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = fmt(y);
      return { startDate: yStr, endDate: yStr, label: 'Hôm qua' };
    }
    case 'this_week': {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(d.setDate(diff));
      return { startDate: fmt(monday), endDate: todayStr, label: 'Tuần này' };
    }
    case 'last_week': {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1) - 7;
      const monday = new Date(d.setDate(diff));
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return { startDate: fmt(monday), endDate: fmt(sunday), label: 'Tuần trước' };
    }
    case 'last_7_days': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { startDate: fmt(d), endDate: todayStr, label: '7 ngày qua' };
    }
    case 'last_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: fmt(firstDay), endDate: fmt(lastDay), label: 'Tháng trước' };
    }
    case 'last_30_days': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { startDate: fmt(d), endDate: todayStr, label: '30 ngày qua' };
    }
    case 'this_year': {
      const firstDay = new Date(now.getFullYear(), 0, 1);
      return { startDate: fmt(firstDay), endDate: todayStr, label: 'Năm nay' };
    }
    case 'last_year': {
      const firstDay = new Date(now.getFullYear() - 1, 0, 1);
      const lastDay = new Date(now.getFullYear() - 1, 11, 31);
      return { startDate: fmt(firstDay), endDate: fmt(lastDay), label: 'Năm trước' };
    }
    case 'this_month':
    default: {
      if (preset === 'today') {
        return { startDate: todayStr, endDate: todayStr, label: 'Hôm nay' };
      }
      // Mặc định Tháng này
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: fmt(firstDay), endDate: todayStr, label: 'Tháng này' };
    }
  }
}
