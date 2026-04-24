// 基础JavaScript功能

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
  console.log('页面加载完成，JavaScript已就绪');
  
  // 示例：添加页面加载动画
  const body = document.body;
  body.style.opacity = '0';
  body.style.transition = 'opacity 0.5s ease-in-out';
  
  setTimeout(() => {
    body.style.opacity = '1';
  }, 100);
  
  // 示例：添加导航菜单交互
  const navLinks = document.querySelectorAll('nav a');
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      console.log('导航到:', this.href);
      // 这里可以添加导航动画效果
    });
  });
  
  // 示例：添加表单提交处理
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      console.log('表单提交:', this);
      
      // 简单的表单验证
      const requiredFields = this.querySelectorAll('[required]');
      let isValid = true;
      
      requiredFields.forEach(field => {
        if (!field.value.trim()) {
          isValid = false;
          field.style.borderColor = 'red';
        } else {
          field.style.borderColor = '';
        }
      });
      
      if (isValid) {
        console.log('表单验证通过，准备提交');
        // 这里可以添加AJAX提交逻辑
      } else {
        console.log('表单验证失败，请填写所有必填字段');
      }
    });
  });
});

// 示例：工具函数
function formatDate(date) {
  return new Date(date).toLocaleDateString('zh-CN');
}

function showMessage(message, type = 'info') {
  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  messageElement.textContent = message;
  messageElement.style.padding = '1rem';
  messageElement.style.margin = '1rem 0';
  messageElement.style.borderRadius = '4px';
  
  switch (type) {
    case 'success':
      messageElement.style.backgroundColor = '#d4edda';
      messageElement.style.color = '#155724';
      break;
    case 'error':
      messageElement.style.backgroundColor = '#f8d7da';
      messageElement.style.color = '#721c24';
      break;
    case 'warning':
      messageElement.style.backgroundColor = '#fff3cd';
      messageElement.style.color = '#856404';
      break;
    default:
      messageElement.style.backgroundColor = '#d1ecf1';
      messageElement.style.color = '#0c5460';
  }
  
  document.body.insertBefore(messageElement, document.body.firstChild);
  
  setTimeout(() => {
    messageElement.style.opacity = '0';
    messageElement.style.transition = 'opacity 0.5s ease-in-out';
    setTimeout(() => {
      messageElement.remove();
    }, 500);
  }, 3000);
}
