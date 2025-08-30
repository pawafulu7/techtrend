/**
 * インラインスタイルの安全な管理
 * dangerouslySetInnerHTMLの使用を避けるための代替実装
 */

// SSRローディング用のスタイル
export const ssrLoadingStyles = `
  @keyframes shimmer {
    0% {
      background-position: -1000px 0;
    }
    100% {
      background-position: 1000px 0;
    }
  }
  
  .skeleton {
    background: linear-gradient(
      90deg,
      #f0f0f0 25%,
      #e0e0e0 50%,
      #f0f0f0 75%
    );
    background-size: 1000px 100%;
    animation: shimmer 2s infinite;
    border-radius: 4px;
  }
  
  .skeleton-container {
    padding: 1rem;
    max-width: 1200px;
    margin: 0 auto;
  }
  
  .skeleton-header {
    height: 60px;
    margin-bottom: 1rem;
  }
  
  .skeleton-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.5rem;
  }
  
  .skeleton-card {
    height: 200px;
  }
`;

// テーマ切り替え用のスタイル
export const themeStyles = `
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
  
  * {
    border-color: hsl(var(--border));
  }
  
  body {
    color: hsl(var(--foreground));
    background: hsl(var(--background));
  }
`;

// テーマ初期化スクリプト（XSS対策済み）
export const themeInitScript = `
(function() {
  try {
    const theme = localStorage.getItem('theme') || 'system';
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const activeTheme = theme === 'system' ? systemTheme : theme;
    
    if (activeTheme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (_error) {
    // localStorageが使用できない場合は何もしない
  }
})();
`;

// SSRローディング初期化スクリプト
export const ssrLoadingInitScript = `
(function() {
  // DOMContentLoadedを待つ
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      // ローディング要素を削除
      const loader = document.getElementById('ssr-loading');
      if (loader) {
        setTimeout(function() {
          loader.style.opacity = '0';
          setTimeout(function() {
            loader.remove();
          }, 300);
        }, 100);
      }
    });
  }
})();
`;