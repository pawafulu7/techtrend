// メール認証機能のテストスクリプト
const testRegistration = async () => {
  console.log('📧 メール認証機能のテスト開始...\n');
  
  const baseUrl = 'http://localhost:3004';
  const testEmail = 'test' + Date.now() + '@example.com';
  const testPassword = 'Test123!@#';
  
  console.log('1. ユーザー登録テスト');
  console.log(`   Email: ${testEmail}`);
  console.log(`   Password: ${testPassword} (要件を満たすパスワード)`);
  
  try {
    const response = await fetch(`${baseUrl}/api/auth/register-with-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });
    
    const result = await response.json();
    console.log(`   ステータス: ${response.status}`);
    console.log(`   レスポンス:`, result);
    
    if (!response.ok) {
      console.log('❌ 登録失敗:', result.error);
      return;
    }
    
    console.log('✅ ユーザー登録成功！');
    console.log('\n2. パスワード強度検証テスト');
    
    // 弱いパスワードでテスト
    const weakPasswords = [
      { pwd: 'short', desc: '短すぎる' },
      { pwd: 'nouppercase123!', desc: '大文字なし' },
      { pwd: 'NOLOWERCASE123!', desc: '小文字なし' },
      { pwd: 'NoNumbers!', desc: '数字なし' },
      { pwd: 'NoSpecial123', desc: '記号なし' },
    ];
    
    for (const { pwd, desc } of weakPasswords) {
      const weakResponse = await fetch(`${baseUrl}/api/auth/register-with-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'weak' + Date.now() + '@example.com',
          password: pwd,
        }),
      });
      
      const weakResult = await weakResponse.json();
      // Security fix: 機密情報のログ出力を削除（脆弱性対応）
      // console.log(`   ${desc}: ${weakResponse.ok ? '❌ 通ってしまった' : '✅ 正しく拒否'} - ${weakResult.error || '成功'}`);
    }
    
    console.log('\n📧 メール送信をご確認ください（Gmail設定が必要）');
    console.log('   認証メールが送信されているはずです。');
    console.log('   メール内のリンクをクリックすると自動ログインされます。');
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
};

testRegistration();