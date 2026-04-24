// 登录页面专用脚本

// DOM加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    console.log('登录页面JavaScript初始化...');
    
    try {
        var form = document.querySelector('form[action="/login"]');
        if (!form) return;
        
        var submitBtn = form.querySelector('button[type="submit"]');
        var errorBox = document.createElement('div');
        errorBox.style.color = 'var(--accent-red)';
        errorBox.style.marginTop = '0.5rem';
        errorBox.style.textAlign = 'center';
        errorBox.style.display = 'none';
        form.parentNode.insertBefore(errorBox, form.nextSibling);
        
        function showErr(msg) {
            errorBox.textContent = msg;
            errorBox.style.display = 'block';
        }
        
        function hideErr() {
            errorBox.style.display = 'none';
        }
        
        form.addEventListener('submit', function(e) {
            hideErr();
            var email = form.querySelector('#email');
            var pwd = form.querySelector('#password');
            
            if (!email.value || !pwd.value) {
                e.preventDefault();
                showErr('请输入邮箱和密码');
                return;
            }
            
            if (!/.+@.+\..+/.test(email.value)) {
                e.preventDefault();
                showErr('请输入有效的邮箱地址');
                return;
            }
            
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="loading"></span> 登录中...';
                
                setTimeout(function() {
                    // 超时兜底，避免长时间无响应
                    if (submitBtn.disabled) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> 登录';
                        showErr('网络可能不稳定，请重试');
                    }
                }, 8000);
            }
            
            console.log('登录提交', { email: email.value.replace(/@.*/,'@***'), ts: Date.now() });
        });
        
        window.addEventListener('error', function(ev) {
            console.error('登录页面错误:', ev.message);
        });
        
        window.addEventListener('unhandledrejection', function(ev) {
            console.error('登录页面未处理的异常:', ev.reason);
        });
        
    } catch (error) {
        console.error('登录页面JavaScript错误:', error);
    }
});
