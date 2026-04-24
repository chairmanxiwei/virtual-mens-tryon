// 高级交互效果和动画功能

// 全局函数定义
let appShowLoading, appHideLoading, showNotification, showSuccess;

// 加载动画
function initLoadingAnimations() {
    // 创建全局加载覆盖层
    appShowLoading = function(message = '加载中...') {
        // 检查是否已存在加载覆盖层
        if (document.querySelector('.loading-overlay')) {
            return;
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="loading"></div>
                <h3>${message}</h3>
                <p>请稍候，我们正在处理您的请求...</p>
            </div>
        `;
        
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    };
    
    // 隐藏加载覆盖层
    appHideLoading = function() {
        const overlay = document.querySelector('.loading-overlay');
        if (overlay) {
            overlay.remove();
            document.body.style.overflow = '';
        }
    };
}

// 通知系统
function initNotifications() {
    // 创建通知容器
    const notificationContainer = document.createElement('div');
    notificationContainer.className = 'notification-container';
    notificationContainer.style.position = 'fixed';
    notificationContainer.style.top = '20px';
    notificationContainer.style.right = '20px';
    notificationContainer.style.zIndex = '10000';
    notificationContainer.style.display = 'flex';
    notificationContainer.style.flexDirection = 'column';
    notificationContainer.style.gap = '10px';
    document.body.appendChild(notificationContainer);
    
    // 全局通知函数
    showNotification = function(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.style.padding = '15px 20px';
        notification.style.borderRadius = '8px';
        notification.style.boxShadow = 'var(--shadow-xl)';
        notification.style.animation = 'slideIn 0.3s ease-out';
        notification.style.maxWidth = '300px';
        notification.style.wordWrap = 'break-word';
        
        // 设置通知类型样式
        switch (type) {
            case 'success':
                notification.style.background = 'rgba(16, 185, 129, 0.1)';
                notification.style.color = 'var(--secondary-color)';
                notification.style.border = '1px solid rgba(16, 185, 129, 0.2)';
                notification.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
                break;
            case 'error':
                notification.style.background = 'rgba(239, 68, 68, 0.1)';
                notification.style.color = 'var(--error-color)';
                notification.style.border = '1px solid rgba(239, 68, 68, 0.2)';
                notification.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
                break;
            case 'warning':
                notification.style.background = 'rgba(245, 158, 11, 0.1)';
                notification.style.color = 'var(--warning-color)';
                notification.style.border = '1px solid rgba(245, 158, 11, 0.2)';
                notification.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
                break;
            default:
                notification.style.background = 'rgba(59, 130, 246, 0.1)';
                notification.style.color = 'var(--primary-color)';
                notification.style.border = '1px solid rgba(59, 130, 246, 0.2)';
                notification.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
        }
        
        // 添加关闭按钮
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '<i class="fas fa-times"></i>';
        closeButton.style.background = 'none';
        closeButton.style.border = 'none';
        closeButton.style.color = 'inherit';
        closeButton.style.cursor = 'pointer';
        closeButton.style.position = 'absolute';
        closeButton.style.top = '5px';
        closeButton.style.right = '10px';
        closeButton.style.fontSize = '14px';
        closeButton.addEventListener('click', function() {
            notification.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => {
                notification.remove();
            }, 300);
        });
        notification.style.position = 'relative';
        notification.appendChild(closeButton);
        
        // 添加到容器
        notificationContainer.appendChild(notification);
        
        // 自动移除通知
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 5000);
    };
}

// 显示成功消息
showSuccess = function(message) {
    // 创建成功消息元素
    const successElement = document.createElement('div');
    successElement.className = 'success-message';
    successElement.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    successElement.style.position = 'fixed';
    successElement.style.top = '20px';
    successElement.style.right = '20px';
    successElement.style.zIndex = '10000';
    successElement.style.padding = '15px 20px';
    successElement.style.borderRadius = '8px';
    successElement.style.boxShadow = 'var(--shadow-xl)';
    successElement.style.animation = 'slideIn 0.3s ease-out';
    
    document.body.appendChild(successElement);
    
    // 3秒后移除成功消息
    setTimeout(() => {
        successElement.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => {
            successElement.remove();
        }, 300);
    }, 3000);
};

// DOM加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    // 初始化所有交互效果
    initLoadingAnimations(); // 先初始化加载动画，因为其他函数会使用它
    initNotifications(); // 先初始化通知系统，因为其他函数会使用它
    initScrollEffects();
    initNavigation();
    initFormValidation();
    initCardHoverEffects();
    initButtonEffects();
    initFileUpload();
    initSmoothTransitions();
    initTooltips();
    initResponsiveMenu();
    initPageSpecificScripts();
    initLazyLoading();
    initKeyboardShortcuts();
    initThemeToggle();
    initCharts();
    initPageVisibility();
    initTouchOptimizations();
    initAccessibility();
});

// 滚动效果
function initScrollEffects() {
    // 头部滚动效果
    window.addEventListener('scroll', function() {
        const header = document.querySelector('.dashboard-header');
        if (header) {
            if (window.scrollY > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        }

        // 滚动时的元素淡入效果
        const fadeElements = document.querySelectorAll('.welcome-card, .stat-card, .feature-button, .clothing-item, .outfit-card');
        fadeElements.forEach(element => {
            const elementTop = element.getBoundingClientRect().top;
            const elementVisible = 150;
            if (elementTop < window.innerHeight - elementVisible) {
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            }
        });
    });

    // 平滑滚动到锚点
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// 导航菜单交互
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-menu a');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            // 移除所有活动状态
            navLinks.forEach(item => item.classList.remove('active'));
            // 添加当前活动状态
            this.classList.add('active');
        });
    });

    // 基于当前URL设置活动导航项
    const currentPath = window.location.pathname;
    navLinks.forEach(link => {
        const linkPath = new URL(link.href).pathname;
        if (currentPath === linkPath) {
            link.classList.add('active');
        }
    });
}

// 表单验证
function initFormValidation() {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            let isValid = true;
            const requiredFields = form.querySelectorAll('[required]');
            
            requiredFields.forEach(field => {
                if (!field.value.trim()) {
                    isValid = false;
                    showError(field, '此字段为必填项');
                } else if (field.type === 'email' && !isValidEmail(field.value)) {
                    isValid = false;
                    showError(field, '请输入有效的邮箱地址');
                }
            });
            
            if (!isValid) {
                e.preventDefault();
            } else {
                // 显示加载状态
                const submitButton = form.querySelector('button[type="submit"]');
                if (submitButton) {
                    const originalText = submitButton.innerHTML;
                    submitButton.innerHTML = '<span class="loading"></span> 提交中...';
                    submitButton.disabled = true;
                    
                    // 模拟表单提交延迟
                    setTimeout(() => {
                        submitButton.innerHTML = originalText;
                        submitButton.disabled = false;
                    }, 2000);
                }
            }
        });
    });

    // 实时验证
    const inputFields = document.querySelectorAll('input, select, textarea');
    inputFields.forEach(field => {
        field.addEventListener('blur', function() {
            if (this.hasAttribute('required') && !this.value.trim()) {
                showError(this, '此字段为必填项');
            } else if (this.type === 'email' && this.value && !isValidEmail(this.value)) {
                showError(this, '请输入有效的邮箱地址');
            } else {
                removeError(this);
            }
        });

        field.addEventListener('input', function() {
            removeError(this);
        });
    });
}

// 邮箱验证
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// 显示错误信息
function showError(field, message) {
    // 移除已存在的错误信息
    removeError(field);
    
    // 创建错误信息元素
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    
    // 插入错误信息
    field.parentNode.appendChild(errorElement);
    
    // 添加错误样式到输入框
    field.classList.add('error');
}

// 移除错误信息
function removeError(field) {
    const errorElement = field.parentNode.querySelector('.error-message');
    if (errorElement) {
        errorElement.remove();
    }
    field.classList.remove('error');
}

// 卡片悬停效果
function initCardHoverEffects() {
    const cards = document.querySelectorAll('.stat-card, .clothing-item, .outfit-card, .account-info-item');
    cards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-10px) scale(1.02)';
            this.style.boxShadow = 'var(--shadow-xl)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
            this.style.boxShadow = 'var(--shadow)';
        });
    });
}

// 按钮效果
function initButtonEffects() {
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px) scale(1.02)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
        
        button.addEventListener('mousedown', function() {
            this.style.transform = 'translateY(0) scale(0.98)';
        });
        
        button.addEventListener('mouseup', function() {
            this.style.transform = 'translateY(-2px) scale(1.02)';
        });
    });
}

// 文件上传交互
function initFileUpload() {
    const fileUploads = document.querySelectorAll('.file-upload');
    fileUploads.forEach(upload => {
        const input = upload.querySelector('input[type="file"]');
        const label = upload.querySelector('.file-upload-label');
        
        if (input && label) {
            input.addEventListener('change', function() {
                const fileName = this.files[0] ? this.files[0].name : '未选择文件';
                const fileNameElement = label.querySelector('.file-name');
                
                if (fileNameElement) {
                    fileNameElement.textContent = fileName;
                } else {
                    // 创建文件名显示元素
                    const fileNameElement = document.createElement('div');
                    fileNameElement.className = 'file-name';
                    fileNameElement.style.marginTop = '10px';
                    fileNameElement.style.fontSize = '0.875rem';
                    fileNameElement.style.color = 'var(--primary-color)';
                    fileNameElement.textContent = fileName;
                    label.appendChild(fileNameElement);
                }
                
                // 更改上传区域样式
                label.style.borderColor = 'var(--primary-color)';
                label.style.background = 'rgba(59, 130, 246, 0.1)';
            });
        }
    });
}

// 平滑过渡效果
function initSmoothTransitions() {
    // 为所有页面元素添加淡入效果
    const fadeElements = document.querySelectorAll('.welcome-card, .stat-card, .feature-button, .clothing-item, .outfit-card, .account-info-item');
    fadeElements.forEach((element, index) => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(20px)';
        element.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        
        //  staggered animation
        setTimeout(() => {
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        }, 100 * index);
    });
}

// 工具提示
function initTooltips() {
    const tooltipElements = document.querySelectorAll('.tooltip');
    tooltipElements.forEach(element => {
        // 添加工具提示样式
        element.style.position = 'relative';
        element.style.cursor = 'help';
    });
}

// 响应式菜单
function initResponsiveMenu() {
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            this.classList.toggle('active');
        });
    }

    // 窗口大小变化时调整菜单
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768 && navMenu) {
            navMenu.classList.remove('active');
            if (menuToggle) {
                menuToggle.classList.remove('active');
            }
        }
    });
}

// AI搭配页面交互
function initAIOutfitPage() {
    const generateButton = document.querySelector('#generate-outfit');
    if (generateButton) {
        generateButton.addEventListener('click', function() {
            // 显示加载状态
            appShowLoading('正在生成搭配方案...');
            
            // 模拟API调用延迟
            setTimeout(() => {
                // 隐藏加载状态
                appHideLoading();
                
                // 显示成功消息
                showSuccess('搭配方案生成成功！');
            }, 3000);
        });
    }
}

// 虚拟试穿页面交互
function initVirtualTryonPage() {
    const tryonButton = document.querySelector('#tryon-button');
    if (tryonButton) {
        tryonButton.addEventListener('click', function() {
            // 显示加载状态
            appShowLoading('正在处理虚拟试穿...');
            
            // 模拟API调用延迟
            setTimeout(() => {
                // 隐藏加载状态
                appHideLoading();
                
                // 显示成功消息
                showSuccess('虚拟试穿完成！');
            }, 4000);
        });
    }
}

// 衣橱页面交互
function initWardrobePage() {
    const clothingItems = document.querySelectorAll('.clothing-item');
    clothingItems.forEach(item => {
        // 添加点击事件，显示详细信息
        item.addEventListener('click', function() {
            const itemId = this.getAttribute('data-id');
            if (itemId) {
                // 这里可以添加显示详细信息的逻辑
                console.log('查看衣物详情:', itemId);
            }
        });
    });
}

// 页面特定初始化
function initPageSpecificScripts() {
    // 根据当前页面路径执行特定初始化
    const currentPath = window.location.pathname;
    
    if (currentPath.includes('/ai-outfit')) {
        initAIOutfitPage();
    } else if (currentPath.includes('/virtual-tryon')) {
        initVirtualTryonPage();
    } else if (currentPath.includes('/wardrobe')) {
        initWardrobePage();
    }
}

// 性能优化：图片懒加载
function initLazyLoading() {
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const image = entry.target;
                    const thumb = image.getAttribute('data-thumb');
                    const full = image.getAttribute('data-full') || image.getAttribute('data-src');
                    if (thumb) {
                        image.src = thumb;
                        image.onload = function() {
                            setTimeout(() => { if (full) image.src = full; }, 200);
                        };
                    } else if (full) {
                        image.src = full;
                    }
                    image.classList.remove('lazy');
                    imageObserver.unobserve(image);
                }
            });
        });
        
        document.querySelectorAll('img[data-src], img[data-full], img.lazy-img').forEach(img => {
            imageObserver.observe(img);
        });
    }
}

// 键盘快捷键
function initKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + K 快速搜索
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.querySelector('input[type="search"]');
            if (searchInput) {
                searchInput.focus();
            }
        }
        
        // Esc 键关闭模态框或下拉菜单
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal.active');
            modals.forEach(modal => {
                modal.classList.remove('active');
            });
            
            const dropdowns = document.querySelectorAll('.dropdown.active');
            dropdowns.forEach(dropdown => {
                dropdown.classList.remove('active');
            });
        }
    });
}

// 暗色/亮色模式切换
function initThemeToggle() {
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            document.body.classList.toggle('light-theme');
            
            // 保存主题偏好到本地存储
            const isLightTheme = document.body.classList.contains('light-theme');
            localStorage.setItem('theme', isLightTheme ? 'light' : 'dark');
        });
    }
    
    // 加载保存的主题偏好
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    }
}

// 数据可视化（如果需要）
function initCharts() {
    // 这里可以集成Chart.js或其他图表库
    // 示例：
    // if (typeof Chart !== 'undefined') {
    //     const ctx = document.getElementById('stats-chart');
    //     if (ctx) {
    //         new Chart(ctx, {
    //             type: 'bar',
    //             data: {
    //                 labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    //                 datasets: [{
    //                     label: '搭配次数',
    //                     data: [12, 19, 3, 5, 2, 3, 7],
    //                     backgroundColor: 'rgba(59, 130, 246, 0.6)',
    //                     borderColor: 'rgba(59, 130, 246, 1)',
    //                     borderWidth: 1
    //                 }]
    //             },
    //             options: {
    //                 responsive: true,
    //                 scales: {
    //                     y: {
    //                         beginAtZero: true,
    //                         grid: {
    //                             color: 'rgba(255, 255, 255, 0.1)'
    //                         },
    //                         ticks: {
    //                             color: 'var(--text-secondary)'
    //                         }
    //                     },
    //                     x: {
    //                         grid: {
    //                             color: 'rgba(255, 255, 255, 0.1)'
    //                         },
    //                         ticks: {
    //                             color: 'var(--text-secondary)'
    //                         }
    //                     }
    //                 },
    //                 plugins: {
    //                     legend: {
    //                         labels: {
    //                             color: 'var(--text-primary)'
    //                         }
    //                     }
    //                 }
    //             }
    //         });
    //     }
    // }
}

// 页面可见性API - 优化性能
function initPageVisibility() {
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            // 页面不可见时暂停动画和视频
            const animations = document.querySelectorAll('.animated');
            animations.forEach(animation => {
                animation.style.animationPlayState = 'paused';
            });
            
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                if (!video.paused) {
                    video.pause();
                }
            });
        } else {
            // 页面可见时恢复动画
            const animations = document.querySelectorAll('.animated');
            animations.forEach(animation => {
                animation.style.animationPlayState = 'running';
            });
        }
    });
}

// 触摸设备优化
function initTouchOptimizations() {
    // 检测触摸设备
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (isTouchDevice) {
        document.body.classList.add('touch-device');
        
        // 为触摸设备添加特殊样式和交互
        const buttons = document.querySelectorAll('.btn');
        buttons.forEach(button => {
            button.style.touchAction = 'manipulation';
            button.style.cursor = 'pointer';
        });
        
        // 优化滚动
        document.body.style.webkitOverflowScrolling = 'touch';
    }
}

// 无障碍功能增强
function initAccessibility() {
    // 为所有可聚焦元素添加焦点样式
    const focusableElements = document.querySelectorAll('button, input, select, textarea, a[href]');
    focusableElements.forEach(element => {
        element.setAttribute('tabindex', '0');
    });
    
    // 为表单元素添加标签关联
    const formInputs = document.querySelectorAll('input, select, textarea');
    formInputs.forEach(input => {
        if (!input.id) {
            input.id = 'input-' + Math.random().toString(36).substr(2, 9);
        }
        
        const label = input.parentNode.querySelector('label');
        if (label && !label.htmlFor) {
            label.htmlFor = input.id;
        }
    });
    
    // 键盘导航优化
    document.addEventListener('keydown', function(e) {
        // 跳过链接和按钮的Tab键导航
        if (e.key === 'Tab') {
            // 可以添加自定义Tab键导航逻辑
        }
    });
}

// 导出全局函数（如果需要）
if (typeof window !== 'undefined') {
    window.App = {
        showLoading: appShowLoading,
        hideLoading: appHideLoading,
        showNotification,
        showSuccess
    };
}

// 图片加载重试与占位
function initImageRetries() {
    const images = document.querySelectorAll('img.lazy-img, img.art-card-image');
    images.forEach(img => {
        const placeholder = '/img/placeholder.svg';
        const source = img.getAttribute('data-src') || img.getAttribute('src');
        const maxRetries = parseInt(img.getAttribute('data-retries') || '2', 10);
        let attempts = 0;
        const statusBadge = document.createElement('div');
        statusBadge.className = 'img-status';
        statusBadge.style.position = 'absolute';
        statusBadge.style.top = '8px';
        statusBadge.style.right = '8px';
        statusBadge.style.background = 'rgba(0,0,0,0.4)';
        statusBadge.style.color = '#fff';
        statusBadge.style.fontSize = '10px';
        statusBadge.style.padding = '2px 6px';
        statusBadge.style.borderRadius = '10px';
        statusBadge.style.pointerEvents = 'none';
        const parentCard = img.closest('.art-card');
        if (parentCard && !parentCard.querySelector('.img-status')) {
            parentCard.style.position = 'relative';
            parentCard.appendChild(statusBadge);
        }
        const setStatus = (text) => { statusBadge.textContent = text; };
        const tryLoad = (url) => {
            setStatus('加载中');
            attempts++;
            img.src = url;
        };
        img.addEventListener('load', () => setStatus('成功'));
        img.addEventListener('error', () => {
            if (attempts <= maxRetries) {
                setStatus('重试中');
                setTimeout(() => tryLoad(source), 500);
            } else {
                setStatus('失败');
                img.src = placeholder;
            }
        });
        if (img.classList.contains('lazy-img') && img.getAttribute('data-src')) {
            img.src = placeholder;
            setTimeout(() => tryLoad(img.getAttribute('data-src')), 100);
        } else {
            tryLoad(source || placeholder);
        }
    });
}
