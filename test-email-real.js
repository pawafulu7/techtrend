// Test Resend email sending with real email
const { Resend } = require('resend');

const resend = new Resend('re_KRKVgs6V_Q18bH18NmWkNtPCkcrVDxj4H');

async function testEmail() {
  console.log('Testing Resend email sending...');
  console.log('From: onboarding@resend.dev');
  console.log('Please enter your email address to test:');
  
  try {
    // 実際のメールアドレスを指定してテスト
    const testEmails = [
      'your-email@gmail.com',  // ここを実際のメールアドレスに変更
    ];
    
    for (const email of testEmails) {
      console.log(`\nSending to: ${email}`);
      
      const data = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: email,
        subject: 'TechTrend - メールアドレスの確認',
        html: `
          <h2>TechTrend メール認証テスト</h2>
          <p>このメールは正常に送信されました。</p>
          <p>実際の認証リンクはAuth.jsから生成されます。</p>
          <a href="http://localhost:3003/auth/verify?token=test">テストリンク</a>
        `,
        text: 'TechTrend メール認証テスト\n\nこのメールは正常に送信されました。',
      });
      
      if (data.error) {
        console.error('Error:', data.error);
      } else {
        console.log('Success! Email ID:', data.data?.id);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// 使用方法を表示
console.log('=================================');
console.log('Resend Email Test');
console.log('=================================');
console.log('このファイルの14行目のメールアドレスを');
console.log('実際のメールアドレスに変更してから実行してください。');
console.log('');
console.log('例: node test-email-real.js');
console.log('=================================\n');

// コマンドライン引数でメールアドレスを指定された場合
if (process.argv[2]) {
  const email = process.argv[2];
  console.log(`Testing with email: ${email}\n`);
  
  resend.emails.send({
    from: 'onboarding@resend.dev',
    to: email,
    subject: 'TechTrend - テストメール',
    html: '<h2>TechTrend</h2><p>メール送信テスト成功！</p>',
    text: 'TechTrend - メール送信テスト成功！',
  }).then(result => {
    if (result.error) {
      console.error('Error:', result.error);
    } else {
      console.log('✅ Success! Email sent to:', email);
      console.log('Email ID:', result.data?.id);
    }
  }).catch(err => {
    console.error('❌ Error:', err);
  });
} else {
  console.log('使用例: node test-email-real.js your-email@example.com');
}