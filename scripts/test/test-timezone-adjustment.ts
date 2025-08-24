#!/usr/bin/env node

/**
 * タイムゾーン調整機能の動作テスト
 * 未来日付の記事を意図的に作成し、adjustTimezoneForArticle関数が正しく動作するか確認
 */

import { adjustTimezoneForArticle } from '@/lib/utils/date';

console.error('========================================');
console.error(' タイムゾーン調整機能 動作テスト');
console.error('========================================\n');

// テストケース1: 1時間後の日付
console.error('[テスト1] 1時間後の未来日付');
const futureDate1 = new Date();
futureDate1.setHours(futureDate1.getHours() + 1);
console.error(`入力: ${futureDate1.toISOString()}`);
const adjusted1 = adjustTimezoneForArticle(futureDate1, 'Test Source 1');
console.error(`出力: ${adjusted1.toISOString()}`);
console.error(`結果: ${adjusted1 <= new Date() ? '✅ 合格（現在時刻以前に調整）' : '❌ 失敗'}\n`);

// テストケース2: 1日後の日付
console.error('[テスト2] 1日後の未来日付');
const futureDate2 = new Date();
futureDate2.setDate(futureDate2.getDate() + 1);
console.error(`入力: ${futureDate2.toISOString()}`);
const adjusted2 = adjustTimezoneForArticle(futureDate2, 'Test Source 2');
console.error(`出力: ${adjusted2.toISOString()}`);
console.error(`結果: ${adjusted2 <= new Date() ? '✅ 合格（現在時刻以前に調整）' : '❌ 失敗'}\n`);

// テストケース3: 過去の日付（変更されないはず）
console.error('[テスト3] 過去の日付（1日前）');
const pastDate = new Date();
pastDate.setDate(pastDate.getDate() - 1);
const pastDateOriginal = new Date(pastDate);
console.error(`入力: ${pastDate.toISOString()}`);
const adjusted3 = adjustTimezoneForArticle(pastDate, 'Test Source 3');
console.error(`出力: ${adjusted3.toISOString()}`);
console.error(`結果: ${adjusted3.getTime() === pastDateOriginal.getTime() ? '✅ 合格（変更されない）' : '❌ 失敗'}\n`);

// テストケース4: 現在時刻（変更されないはず）
console.error('[テスト4] 現在時刻');
const now = new Date();
const nowOriginal = new Date(now);
console.error(`入力: ${now.toISOString()}`);
const adjusted4 = adjustTimezoneForArticle(now, 'Test Source 4');
console.error(`出力: ${adjusted4.toISOString()}`);
console.error(`結果: ${adjusted4.getTime() === nowOriginal.getTime() ? '✅ 合格（変更されない）' : '❌ 失敗'}\n`);

// テストケース5: 実際のソース名でのテスト
console.error('[テスト5] 実際のソース名でのテスト（Google Developers Blog）');
const futureDate5 = new Date();
futureDate5.setHours(futureDate5.getHours() + 8); // PST/PDTの時差を想定
console.error(`入力: ${futureDate5.toISOString()}`);
const adjusted5 = adjustTimezoneForArticle(futureDate5, 'Google Developers Blog');
console.error(`出力: ${adjusted5.toISOString()}`);
console.error(`結果: ${adjusted5 <= new Date() ? '✅ 合格（現在時刻以前に調整）' : '❌ 失敗'}\n`);

console.error('========================================');
console.error(' テスト完了');
console.error('========================================');