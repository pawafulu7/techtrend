import { techTermsManager } from '@/lib/summary/quality/tech-terms-manager';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function updateTechTerms() {
  console.error('🔧 技術用語辞書の更新\n');
  console.error('=' .repeat(60));
  
  try {
    // 既存の辞書を読み込み
    await techTermsManager.loadCustomTerms();
    
    console.error(`\n📊 現在の統計:`);
    console.error(`  登録用語数: ${techTermsManager.getTermCount()}個`);
    console.error(`  最終更新: ${techTermsManager.getLastUpdated().toLocaleString()}`);
    
    // 更新オプションを表示
    console.error('\n選択してください:');
    console.error('1. リモートから更新');
    console.error('2. 手動で用語を追加');
    console.error('3. 用語を検索');
    console.error('4. 用語を削除');
    console.error('5. 使用統計を表示');
    console.error('6. 終了');
    
    const choice = await question('\n選択 (1-6): ');
    
    switch (choice) {
      case '1':
        // リモート更新
        console.error('\n🌐 リモートから更新中...');
        const url = await question('更新URL (Enterでデフォルト): ');
        await techTermsManager.updateFromRemote(url || undefined);
        console.error('✅ 更新完了');
        break;
        
      case '2':
        // 手動追加
        console.error('\n➕ 用語を追加（カンマ区切りで複数可、終了は空Enter）');
        while (true) {
          const input = await question('用語: ');
          if (!input) break;
          
          const terms = input.split(',').map(t => t.trim()).filter(t => t);
          techTermsManager.addCustomTerms(terms);
          console.error(`✅ ${terms.length}個の用語を追加しました`);
        }
        
        // 保存
        await techTermsManager.saveCustomTerms();
        console.error('💾 辞書を保存しました');
        break;
        
      case '3':
        // 検索
        const query = await question('\n🔍 検索キーワード: ');
        const results = techTermsManager.searchTerms(query);
        
        if (results.length === 0) {
          console.error('見つかりませんでした');
        } else {
          console.error(`\n検索結果 (${results.length}件):`);
          results.forEach(term => console.error(`  - ${term}`));
        }
        break;
        
      case '4':
        // 削除
        const termToDelete = await question('\n❌ 削除する用語: ');
        if (techTermsManager.removeTerm(termToDelete)) {
          await techTermsManager.saveCustomTerms();
          console.error(`✅ "${termToDelete}" を削除しました`);
        } else {
          console.error('用語が見つかりませんでした');
        }
        break;
        
      case '5':
        // 使用統計
        const stats = techTermsManager.getUsageStats();
        if (stats.size === 0) {
          console.error('\n使用統計データがありません');
        } else {
          console.error('\n📊 使用頻度TOP10:');
          const sorted = Array.from(stats.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
          
          sorted.forEach(([term, count], index) => {
            console.error(`  ${index + 1}. ${term}: ${count}回`);
          });
        }
        break;
        
      case '6':
        console.error('👋 終了します');
        break;
        
      default:
        console.error('無効な選択です');
    }
    
    // 最終統計を表示
    if (choice !== '6') {
      console.error('\n' + '=' .repeat(60));
      console.error('📊 更新後の統計:');
      console.error(`  登録用語数: ${techTermsManager.getTermCount()}個`);
      console.error(`  最終更新: ${techTermsManager.getLastUpdated().toLocaleString()}`);
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    rl.close();
  }
}

// インタラクティブモード
async function interactiveMode() {
  console.error('🔧 技術用語辞書管理ツール（インタラクティブモード）\n');
  
  await techTermsManager.loadCustomTerms();
  
  while (true) {
    console.error('\n' + '=' .repeat(60));
    console.error('コマンド:');
    console.error('  add <term1,term2,...> - 用語を追加');
    console.error('  search <query>        - 用語を検索');
    console.error('  delete <term>         - 用語を削除');
    console.error('  stats                 - 統計を表示');
    console.error('  list                  - すべての用語を表示（大量注意）');
    console.error('  save                  - 変更を保存');
    console.error('  exit                  - 終了');
    
    const input = await question('\n> ');
    const [command, ...args] = input.split(' ');
    const argument = args.join(' ');
    
    switch (command.toLowerCase()) {
      case 'add':
        if (!argument) {
          console.error('使用法: add <term1,term2,...>');
          break;
        }
        const terms = argument.split(',').map(t => t.trim()).filter(t => t);
        techTermsManager.addCustomTerms(terms);
        console.error(`✅ ${terms.length}個の用語を追加`);
        break;
        
      case 'search':
        if (!argument) {
          console.error('使用法: search <query>');
          break;
        }
        const results = techTermsManager.searchTerms(argument);
        if (results.length === 0) {
          console.error('見つかりません');
        } else {
          console.error(`検索結果 (${results.length}件):`);
          results.slice(0, 20).forEach(term => console.error(`  - ${term}`));
          if (results.length > 20) {
            console.error(`  ... 他${results.length - 20}件`);
          }
        }
        break;
        
      case 'delete':
        if (!argument) {
          console.error('使用法: delete <term>');
          break;
        }
        if (techTermsManager.removeTerm(argument)) {
          console.error(`✅ "${argument}" を削除`);
        } else {
          console.error('用語が見つかりません');
        }
        break;
        
      case 'stats':
        console.error(`登録用語数: ${techTermsManager.getTermCount()}個`);
        console.error(`最終更新: ${techTermsManager.getLastUpdated().toLocaleString()}`);
        break;
        
      case 'list':
        const allTerms = Array.from(techTermsManager.getTerms());
        console.error(`全用語 (${allTerms.length}個):`);
        const displayCount = Math.min(allTerms.length, 50);
        allTerms.slice(0, displayCount).forEach(term => console.error(`  - ${term}`));
        if (allTerms.length > displayCount) {
          console.error(`  ... 他${allTerms.length - displayCount}件`);
        }
        break;
        
      case 'save':
        await techTermsManager.saveCustomTerms();
        console.error('💾 保存しました');
        break;
        
      case 'exit':
      case 'quit':
        const unsaved = await question('保存して終了しますか？ (y/n): ');
        if (unsaved.toLowerCase() === 'y') {
          await techTermsManager.saveCustomTerms();
          console.error('💾 保存しました');
        }
        console.error('👋 終了します');
        rl.close();
        return;
        
      default:
        if (command) {
          console.error(`不明なコマンド: ${command}`);
        }
    }
  }
}

// 直接実行
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--interactive') || args.includes('-i')) {
    interactiveMode().catch(console.error);
  } else {
    updateTechTerms().catch(console.error);
  }
}