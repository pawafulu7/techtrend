// Test Resend email sending directly
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY || 're_KRKVgs6V_Q18bH18NmWkNtPCkcrVDxj4H');

async function testEmail() {
  try {
    console.log('Testing Resend email sending...');
    console.log('API Key:', process.env.RESEND_API_KEY ? 'Set' : 'Using hardcoded');
    
    const data = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'test@example.com', // Change this to your email
      subject: 'Test Email from TechTrend',
      html: '<p>This is a test email to verify Resend configuration.</p>',
      text: 'This is a test email to verify Resend configuration.',
    });
    
    console.log('Success:', data);
  } catch (error) {
    console.error('Error:', error);
  }
}

testEmail();