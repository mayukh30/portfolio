let scene, camera, renderer, particles;
        let mouseX = 0, mouseY = 0;

        function initThreeJS() {
            scene = new THREE.Scene();
            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setClearColor(0x000000, 0);
            document.getElementById('three-container').appendChild(renderer.domElement);

            // Create particles
            const geometry = new THREE.BufferGeometry();
            const particleCount = 2000;
            const positions = new Float32Array(particleCount * 3);
            const colors = new Float32Array(particleCount * 3);
            const sizes = new Float32Array(particleCount);

            for (let i = 0; i < particleCount * 3; i += 3) {
                positions[i] = (Math.random() - 0.5) * 2000;
                positions[i + 1] = (Math.random() - 0.5) * 2000;
                positions[i + 2] = (Math.random() - 0.5) * 2000;

                // Color gradient from cyan to magenta
                const t = Math.random();
                colors[i] = t; // R
                colors[i + 1] = 1 - t; // G
                colors[i + 2] = 1; // B

                sizes[i / 3] = Math.random() * 3 + 1;
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

            const material = new THREE.ShaderMaterial({
                vertexShader: `
                    attribute float size;
                    attribute vec3 color;
                    varying vec3 vColor;
                    void main() {
                        vColor = color;
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        gl_PointSize = size * (300.0 / -mvPosition.z);
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    varying vec3 vColor;
                    void main() {
                        float distance = length(gl_PointCoord - vec2(0.5));
                        if (distance > 0.5) discard;
                        gl_FragColor = vec4(vColor, 1.0 - distance * 2.0);
                    }
                `,
                transparent: true,
                vertexColors: true
            });

            particles = new THREE.Points(geometry, material);
            scene.add(particles);

            // Add floating geometric shapes
            addFloatingShapes();

            camera.position.z = 500;

            // Mouse movement listener
            document.addEventListener('mousemove', onMouseMove);
            window.addEventListener('resize', onWindowResize);

            animate();
        }

        function addFloatingShapes() {
            const shapes = [];
            const geometryTypes = [
                new THREE.BoxGeometry(20, 20, 20),
                new THREE.SphereGeometry(10, 32, 32),
                new THREE.ConeGeometry(10, 20, 32),
                new THREE.TorusGeometry(10, 3, 16, 100)
            ];
            const material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.2 });   
            const light = new THREE.DirectionalLight(0xffffff, 1);
            light.position.set(1, 1, 1).normalize();
            scene.add(light);
            scene.add(new THREE.AmbientLight(0x404040)); // soft white light
            for (let i = 0; i < 10; i++) {
                const geometry = geometryTypes[Math.floor(Math.random() * geometryTypes.length)];
                const shape = new THREE.Mesh(geometry, material);
                shape.position.set((Math.random() - 0.5) * 1000, (Math.random() - 0.5) * 1000, (Math.random() - 0.5) * 1000);
                shape.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                scene.add(shape);
                shapes.push(shape);
            }
            window.floatingShapes = shapes; // Store globally for animation
        }


        function onMouseMove(event) {
            mouseX = (event.clientX - window.innerWidth / 2) * 0.01;
            mouseY = (event.clientY - window.innerHeight / 2) * 0.01;
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        function animate() {
            requestAnimationFrame(animate);

            const time = Date.now() * 0.0005;

            // Rotate particles
            particles.rotation.x = time * 0.2;
            particles.rotation.y = time * 0.1;

            // Mouse interaction
            particles.position.x = mouseX * 20;
            particles.position.y = -mouseY * 20;

            // Animate floating shapes
            if (window.floatingShapes) {
                window.floatingShapes.forEach((shape, index) => {
                    shape.rotation.x = time * (0.5 + index * 0.1);
                    shape.rotation.y = time * (0.3 + index * 0.1);
                    shape.rotation.z = time * (0.2 + index * 0.1);
                    
                    // Floating motion
                    shape.position.y += Math.sin(time + index) * 0.5;
                    shape.position.x += Math.cos(time + index * 0.5) * 0.3;
                });
            }

            renderer.render(scene, camera);
        }


        // Smooth scrolling
        function initSmoothScrolling() {
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', function (e) {
                    e.preventDefault();
                    const target = document.querySelector(this.getAttribute('href'));
                    if (target) {
                        target.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start'
                        });
                    }
                });
            });
        }

        // Navbar scroll effect
        function initNavbarEffect() {
            window.addEventListener('scroll', function() {
                const navbar = document.querySelector('.navbar');
                if (window.scrollY > 100) {
                    navbar.style.background = 'rgba(0, 0, 0, 0.95)';
                } else {
                    navbar.style.background = 'rgba(0, 0, 0, 0.8)';
                }
            });
        }

        // Intersection Observer for animations
        function initScrollAnimations() {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0)';
                    }
                });
            }, { threshold: 0.1 });

            // Observe all floating cards and other elements
            document.querySelectorAll('.floating-card, .skill-item, .project-card, .hobby-item').forEach(el => {
                el.style.opacity = '0';
                el.style.transform = 'translateY(50px)';
                el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                observer.observe(el);
            });
        }
function initFormSubmission() {
    const form = document.getElementById('contact-form');
    const statusEl = document.getElementById('form-status');
    const configuredApiBaseUrl = (window.API_BASE_URL || '').replace(/\/$/, '');

    if (!form) {
        console.error("contact-form not found in DOM");
        return;
    }

    const setStatus = (message, type) => {
        if (!statusEl) {
            return;
        }
        statusEl.textContent = message;
        statusEl.classList.remove('success', 'error');
        if (type) {
            statusEl.classList.add(type);
        }
    };

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const formData = new FormData(form);
        const data = {
            name: String(formData.get('name') || '').trim(),
            email: String(formData.get('email') || '').trim(),
            phone: String(formData.get('phone') || '').trim(),
            message: String(formData.get('message') || '').trim()
        };

        if (!data.name || !data.email || !data.phone || !data.message) {
            setStatus('Please fill in all fields.', 'error');
            return;
        }

        setStatus('Sending message...', null);

        try {
            const apiUrl = configuredApiBaseUrl
                ? `${configuredApiBaseUrl}/api/messages`
                : '/api/messages';

            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });

            const result = await res.json().catch(() => ({}));

            if (res.ok) {
                setStatus(result.message || 'Message sent successfully!', 'success');
                form.reset();
            } else {
                setStatus(result.error || 'Error submitting form.', 'error');
            }
        } catch (err) {
            console.error('Fetch error:', err);
            setStatus('Could not send message. Please try again.', 'error');
        }
    });
}

function initChatbot() {
    const toggleBtn = document.getElementById('chatbot-toggle');
    const closeBtn = document.getElementById('chatbot-close');
    const panel = document.getElementById('chatbot-panel');
    const form = document.getElementById('chatbot-form');
    const input = document.getElementById('chatbot-input');
    const messages = document.getElementById('chatbot-messages');

    if (!toggleBtn || !closeBtn || !panel || !form || !input || !messages) {
        return;
    }

    const configuredApiBaseUrl = (window.API_BASE_URL || '').replace(/\/$/, '');

    const appendMessage = (text, role) => {
        const bubble = document.createElement('div');
        bubble.className = `chatbot-message ${role}`;
        bubble.textContent = text;
        messages.appendChild(bubble);
        messages.scrollTop = messages.scrollHeight;
    };

    const setPanelState = (isOpen) => {
        if (isOpen) {
            panel.classList.add('open');
            input.focus();
            return;
        }
        panel.classList.remove('open');
    };

    toggleBtn.addEventListener('click', () => {
        const isOpen = panel.classList.contains('open');
        setPanelState(!isOpen);
    });

    closeBtn.addEventListener('click', () => {
        setPanelState(false);
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const text = String(input.value || '').trim();
        if (!text) {
            return;
        }

        appendMessage(text, 'user');
        input.value = '';
        appendMessage('Thinking...', 'bot');

        const apiUrl = configuredApiBaseUrl
            ? `${configuredApiBaseUrl}/api/chat`
            : '/api/chat';

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });

            const payload = await response.json().catch(() => ({}));
            const loader = messages.querySelector('.chatbot-message.bot:last-child');
            if (loader && loader.textContent === 'Thinking...') {
                loader.remove();
            }

            if (!response.ok) {
                appendMessage(payload.error || 'Chatbot is unavailable right now.', 'bot');
                return;
            }

            appendMessage(payload.reply || 'I could not process that. Try another question.', 'bot');
        } catch (_err) {
            const loader = messages.querySelector('.chatbot-message.bot:last-child');
            if (loader && loader.textContent === 'Thinking...') {
                loader.remove();
            }
            appendMessage('Network issue. Please try again in a moment.', 'bot');
        }
    });
}


        // Hobby items click animation
        function initHobbyAnimations() {
            document.querySelectorAll('.hobby-item').forEach(item => {
                item.addEventListener('click', function() {
                    this.style.transform = 'scale(1.1) rotateZ(5deg)';
                    setTimeout(() => {
                        this.style.transform = '';
                    }, 300);
                });
            });
        }

        function initCertificateModal() {
            const modal = document.getElementById("certificate-modal");
            const modalImg = document.getElementById("modal-img");
            const closeBtn = document.querySelector(".modal-close");
            document.querySelectorAll(".certificate-link").forEach(link => {
                link.addEventListener("click", function(e) {
                const type = this.getAttribute("data-type");

                if (type === "image") {
                    e.preventDefault();
                    modal.style.display = "flex";
                    modalImg.src = this.href;
                }
                // If it's PDF, it will just open in new tab (default behavior)
                });
            });

            closeBtn.addEventListener("click", () => modal.style.display = "none");
            modal.addEventListener("click", (e) => {
                if (e.target === modal) modal.style.display = "none";
            });
            }

            // Call on DOM load
            document.addEventListener("DOMContentLoaded", initCertificateModal);


        // Initialize everything when DOM is loaded
        document.addEventListener('DOMContentLoaded', function() {
            initThreeJS();
            if (typeof initProfilePhotoUpload === 'function') {
                initProfilePhotoUpload();
            }
            if (typeof initPhotoUpload === 'function') {
                initPhotoUpload();
            }
            initSmoothScrolling();
            initNavbarEffect();
            initScrollAnimations();
            initFormSubmission();
            initChatbot();
            initHobbyAnimations();
            initCustomCursor();

            // Hide scroll indicator after first scroll
            window.addEventListener('scroll', function() {
                const indicator = document.querySelector('.scroll-indicator');
                if (indicator && window.scrollY > 100) {
                    indicator.style.opacity = '0';
                }
            }, { once: true });
        });

        // Additional interactive features
        function addParticleInteraction() {
            document.addEventListener('click', function(event) {
                // Create burst effect at click position
                const burst = document.createElement('div');
                burst.style.position = 'fixed';
                burst.style.left = event.clientX + 'px';
                burst.style.top = event.clientY + 'px';
                burst.style.width = '10px';
                burst.style.height = '10px';
                burst.style.background = 'radial-gradient(circle, #00f5ff, transparent)';
                burst.style.borderRadius = '50%';
                burst.style.pointerEvents = 'none';
                burst.style.zIndex = '9999';
                burst.style.animation = 'burstAnimation 0.6s ease-out forwards';
                
                document.body.appendChild(burst);
                
                setTimeout(() => {
                    document.body.removeChild(burst);
                }, 600);
            });
        }

        // Add burst animation CSS
        const burstCSS = `
            @keyframes burstAnimation {
                0% {
                    transform: scale(1);
                    opacity: 1;
                }
                100% {
                    transform: scale(20);
                    opacity: 0;
                }
            }
        `;
        const style = document.createElement('style');
        style.textContent = burstCSS;
        document.head.appendChild(style);

        // Initialize burst effect
        document.addEventListener('DOMContentLoaded', addParticleInteraction);


// ─────────────────────────────────────────────
// Custom Cursor + Trail + Spotlight
// ─────────────────────────────────────────────
function initCustomCursor() {
    const dot  = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');
    if (!dot || !ring) return;

    // Spotlight element
    const spotlight = document.createElement('div');
    spotlight.className = 'spotlight';
    document.body.appendChild(spotlight);

    // Trail canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'cursor-trail';
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    window.addEventListener('resize', () => {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    });

    // State
    let mouseX = 0, mouseY = 0;
    let ringX  = 0, ringY  = 0;
    const trail = [];
    const MAX_TRAIL = 28;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;

        // Dot — instant
        dot.style.left = mouseX + 'px';
        dot.style.top  = mouseY + 'px';

        // Spotlight — slightly delayed via CSS transition
        spotlight.style.left = mouseX + 'px';
        spotlight.style.top  = mouseY + 'px';

        // Trail
        trail.push({ x: mouseX, y: mouseY, age: 0 });
        if (trail.length > MAX_TRAIL) trail.shift();
    });

    // Ring follows with lerp (smooth lag)
    function animateCursor() {
        ringX += (mouseX - ringX) * 0.12;
        ringY += (mouseY - ringY) * 0.12;
        ring.style.left = ringX + 'px';
        ring.style.top  = ringY + 'px';

        // Draw trail
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < trail.length; i++) {
            const t = trail[i];
            t.age++;
            const lifeRatio = 1 - (t.age / MAX_TRAIL);
            const radius = lifeRatio * 5 + 1;
            const alpha  = lifeRatio * 0.6;

            // Colour shifts cyan → magenta along trail
            const hue = 180 + (1 - lifeRatio) * 120;
            ctx.beginPath();
            ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${hue}, 100%, 70%, ${alpha})`;
            ctx.fill();
        }
        // Remove dead particles
        for (let i = trail.length - 1; i >= 0; i--) {
            if (trail[i].age >= MAX_TRAIL) trail.splice(i, 1);
        }

        requestAnimationFrame(animateCursor);
    }
    animateCursor();

    // Click ripple burst
    document.addEventListener('click', (e) => {
        const ripple = document.createElement('div');
        Object.assign(ripple.style, {
            position: 'fixed',
            left: e.clientX + 'px',
            top:  e.clientY + 'px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            border: '2px solid #00f5ff',
            pointerEvents: 'none',
            zIndex: '99996',
            transform: 'translate(-50%, -50%) scale(1)',
            transition: 'transform 0.5s ease, opacity 0.5s ease',
            opacity: '1',
        });
        document.body.appendChild(ripple);
        requestAnimationFrame(() => {
            ripple.style.transform = 'translate(-50%, -50%) scale(12)';
            ripple.style.opacity = '0';
        });
        setTimeout(() => ripple.remove(), 550);
    });

    // Hide cursor when leaving window
    document.addEventListener('mouseleave', () => {
        dot.style.opacity  = '0';
        ring.style.opacity = '0';
    });
    document.addEventListener('mouseenter', () => {
        dot.style.opacity  = '1';
        ring.style.opacity = '1';
    });
}