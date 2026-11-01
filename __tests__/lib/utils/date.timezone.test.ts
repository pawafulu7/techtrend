import { adjustTimezoneForArticle, parseRSSDate, formatDate, formatDateWithTime } from '@/lib/utils/date';

describe('adjustTimezoneForArticle', () => {
  let consoleErrorSpy: jest.SpyInstance;
  
  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });
  
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('未来の日付を現在時刻に調整する', () => {
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 1); // 1時間後
    
    const adjusted = adjustTimezoneForArticle(futureDate);
    
    expect(adjusted.getTime()).toBeLessThanOrEqual(new Date().getTime());
    // console.error呼び出しのテストは削除（console文をプロダクションコードから削除したため）
  });

  it('1日後の未来日付を現在時刻に調整する', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1); // 1日後
    
    const adjusted = adjustTimezoneForArticle(futureDate, 'Test Source');
    
    expect(adjusted.getTime()).toBeLessThanOrEqual(new Date().getTime());
    // console.error呼び出しのテストは削除
  });

  it('過去の日付は変更しない', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1); // 1日前
    
    const adjusted = adjustTimezoneForArticle(pastDate);
    
    expect(adjusted.getTime()).toEqual(pastDate.getTime());
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('現在時刻は変更しない', () => {
    const now = new Date();
    
    const adjusted = adjustTimezoneForArticle(now);
    
    expect(adjusted.getTime()).toEqual(now.getTime());
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('ソース名が提供された場合、ログに含まれる', () => {
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 1);
    
    adjustTimezoneForArticle(futureDate, 'Google Developers Blog');
    
    // console.error呼び出しのテストは削除
  });

  it('ソース名が提供されない場合、unknown sourceとして記録', () => {
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 1);
    
    adjustTimezoneForArticle(futureDate);
    // console.error呼び出しのテストは削除
  });
});

describe('parseRSSDate', () => {
  // console文削除に伴い、モック設定も削除

  it('有効な日付文字列を正しくパースする', () => {
    const dateString = '2025-08-15T10:00:00Z';
    const parsed = parseRSSDate(dateString);
    
    expect(parsed.toISOString()).toBe('2025-08-15T10:00:00.000Z');
    // console.warnテストは削除
  });

  it('無効な日付文字列の場合、現在時刻を返す', () => {
    const invalidDate = 'invalid-date';
    const before = new Date();
    const parsed = parseRSSDate(invalidDate);
    const after = new Date();
    
    expect(parsed.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(parsed.getTime()).toBeLessThanOrEqual(after.getTime());
    // console.warnテストは削除
  });

  it('1年以上先の未来日付の場合、現在時刻を返す', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 2);
    
    const parsed = parseRSSDate(futureDate.toISOString());
    const now = new Date();
    
    expect(Math.abs(parsed.getTime() - now.getTime())).toBeLessThan(1000);
    // console.warnテストは削除
  });

  it('異常に大きなタイムスタンプの場合、現在時刻を返す', () => {
    const abnormalTimestamp = '99999999999999';
    
    const parsed = parseRSSDate(abnormalTimestamp);
    const now = new Date();
    
    expect(Math.abs(parsed.getTime() - now.getTime())).toBeLessThan(1000);
    // console.warnテストは削除
  });
});

describe('formatDate', () => {
  it('秒単位の差分を正しくフォーマットする', () => {
    const date = new Date();
    date.setSeconds(date.getSeconds() - 30);
    
    const formatted = formatDate(date);
    expect(formatted).toMatch(/30秒前/);
  });

  it('分単位の差分を正しくフォーマットする', () => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - 15);
    
    const formatted = formatDate(date);
    expect(formatted).toMatch(/15分前/);
  });

  it('時間単位の差分を正しくフォーマットする', () => {
    const date = new Date();
    date.setHours(date.getHours() - 3);
    
    const formatted = formatDate(date);
    expect(formatted).toMatch(/3時間前/);
  });

  it('日単位の差分を正しくフォーマットする', () => {
    const date = new Date();
    date.setDate(date.getDate() - 5);
    
    const formatted = formatDate(date);
    expect(formatted).toMatch(/5日前/);
  });

  it('7日以上前の日付は日付形式でフォーマットする', () => {
    const date = new Date('2025-01-01');
    
    const formatted = formatDate(date);
    expect(formatted).toMatch(/2025\/01\/01/);
  });
});

describe('formatDateWithTime', () => {
  it('日時を正しいフォーマットで返す', () => {
    const date = new Date('2025-08-15T14:30:00');
    
    const formatted = formatDateWithTime(date);
    expect(formatted).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
  });

  it('文字列の日付も正しく処理する', () => {
    const dateString = '2025-08-15T14:30:00';
    
    const formatted = formatDateWithTime(dateString);
    expect(formatted).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});