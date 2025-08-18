export function SSRLoading() {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            #ssr-loading {
              position: fixed;
              inset: 0;
              z-index: 100;
              display: flex;
              align-items: center;
              justify-content: center;
              background: var(--background);
              transition: opacity 0.3s ease;
            }
            
            #ssr-loading.hide {
              opacity: 0;
              pointer-events: none;
            }
            
            .ssr-spinner {
              width: 96px;
              height: 96px;
              border: 4px solid oklch(0.205 0 0 / 20%);
              border-top-color: oklch(0.205 0 0);
              border-radius: 50%;
              animation: spin 1s linear infinite;
            }
            
            .dark .ssr-spinner {
              border-color: oklch(0.922 0 0 / 20%);
              border-top-color: oklch(0.922 0 0);
            }
            
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            
            .ssr-text {
              position: absolute;
              margin-top: 140px;
              font-size: 18px;
              font-weight: 600;
              color: var(--foreground);
            }
            
            .ssr-dots {
              display: flex;
              gap: 4px;
              margin-top: 180px;
              position: absolute;
            }
            
            .ssr-dot {
              width: 8px;
              height: 8px;
              background: oklch(0.205 0 0);
              border-radius: 50%;
              animation: bounce 1.4s ease-in-out infinite;
            }
            
            .dark .ssr-dot {
              background: oklch(0.922 0 0);
            }
            
            .ssr-dot:nth-child(1) { animation-delay: 0ms; }
            .ssr-dot:nth-child(2) { animation-delay: 150ms; }
            .ssr-dot:nth-child(3) { animation-delay: 300ms; }
            
            @keyframes bounce {
              0%, 80%, 100% { transform: translateY(0); }
              40% { transform: translateY(-12px); }
            }
          `,
        }}
      />
      <div id="ssr-loading">
        <div className="ssr-spinner" />
        <div className="ssr-text">TechTrend</div>
        <div className="ssr-dots">
          <div className="ssr-dot" />
          <div className="ssr-dot" />
          <div className="ssr-dot" />
        </div>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            // SSRローディングを非表示にする
            if (typeof window !== 'undefined') {
              window.addEventListener('DOMContentLoaded', function() {
                setTimeout(function() {
                  const loading = document.getElementById('ssr-loading');
                  if (loading) {
                    loading.classList.add('hide');
                    setTimeout(function() {
                      loading.style.display = 'none';
                    }, 300);
                  }
                }, 600);
              });
            }
          `,
        }}
      />
    </>
  );
}