document.addEventListener("DOMContentLoaded", () => {
    // 注册 ScrollTrigger 插件
    try {
        if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
            gsap.registerPlugin(ScrollTrigger);
        } else {
            console.warn("GSAP/ScrollTrigger not loaded, skipping scroll animations");
        }
    } catch (e) {
        console.error('GSAP init failed:', e);
    }

    // 1. Initialize Lenis for Smooth Scrolling (safe fallback)
    let lenis = null;
    try {
        if (typeof Lenis !== 'undefined') {
            lenis = new Lenis({
                duration: 1.2,
                easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
                direction: 'vertical',
                gestureDirection: 'vertical',
                smooth: true,
                mouseMultiplier: 1,
                smoothTouch: false,
                touchMultiplier: 2,
            });
            const raf = (time) => {
                lenis.raf(time);
                requestAnimationFrame(raf);
            };
            requestAnimationFrame(raf);
        } else {
            console.warn('Lenis not available, skipping smooth scroll initialization');
        }
    } catch (e) {
        console.error('Lenis init failed:', e);
    }

    // 2. Custom Cursor Logic
    const cursorDot = document.querySelector('.cursor-dot');
    const cursorOutline = document.querySelector('.cursor-outline');

    if (cursorDot && cursorOutline) {
        // Enable custom cursor only when elements exist
        document.body.classList.add('custom-cursor-enabled');
        window.addEventListener("mousemove", (e) => {
            const posX = e.clientX;
            const posY = e.clientY;

            // Dot follows instantly
            cursorDot.style.left = `${posX}px`;
            cursorDot.style.top = `${posY}px`;

            // Outline follows with delay (using simple animation or just CSS transition)
            // CSS transition on left/top is usually smoother for simple followers
            cursorOutline.animate({
                left: `${posX}px`,
                top: `${posY}px`
            }, { duration: 500, fill: "forwards" });
        });
    } else {
        // Ensure default cursor stays visible if custom elements are missing
        document.body.classList.remove('custom-cursor-enabled');
    }

    // 3. GSAP Animations

    // Hero Text Reveal
    const revealText = document.querySelectorAll(".reveal-text span");
    if (revealText.length > 0) {
        if (typeof gsap !== 'undefined') {
            gsap.to(revealText, {
                y: 0,
                duration: 1.5,
                ease: "power4.out",
                stagger: 0.2,
                delay: 0.5
            });
        }
    }

    // Parallax Effects for Images
    const artImages = document.querySelectorAll(".art-card-image");
    artImages.forEach((img) => {
        if (typeof gsap !== 'undefined') {
            gsap.to(img, {
                yPercent: 20,
                ease: "none",
                scrollTrigger: {
                    trigger: img.parentElement,
                    start: "top bottom",
                    end: "bottom top",
                    scrub: true
                }
            });
        }
    });

    // Gallery Header Pinning
    const gallerySection = document.querySelector(".gallery");
    const galleryHeader = document.querySelector(".gallery-header");
    
    if (gallerySection && galleryHeader && window.innerWidth > 768) {
        // Simple pinning or just let CSS sticky do its job. 
        // Sometimes CSS sticky is smoother than JS pinning for simple layouts.
        // Let's enhance it with opacity/blur on scroll
        
        if (typeof gsap !== 'undefined') {
            gsap.to(galleryHeader, {
                opacity: 0.5,
                scale: 0.9,
                scrollTrigger: {
                    trigger: gallerySection,
                    start: "top top",
                    end: "bottom bottom",
                    scrub: true
                }
            });
        }
    }

    // Stats Counter Animation
    const stats = document.querySelectorAll(".stat-number");
    stats.forEach(stat => {
        const value = parseInt(stat.getAttribute("data-value"));
        if (typeof gsap !== 'undefined') {
            gsap.fromTo(stat, 
                { innerText: 0 },
                {
                    innerText: value,
                    duration: 2,
                    snap: { innerText: 1 },
                    scrollTrigger: {
                        trigger: stat,
                        start: "top 85%",
                    }
                }
            );
        }
    });

    // Horizontal Scroll for a specific section (Optional, if we had one)
    // ...

    console.log("Renaissance Animations Initialized");
});
