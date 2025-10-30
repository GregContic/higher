import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

class ParkourGame {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        
        // Player physics
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canJump = false;
        this.isSprinting = false;
        this.isPressingQ = false;
        
        // Game state
        this.gameStarted = false;
        this.maxHeight = 0;
        this.currentHeight = 0;
        this.platforms = [];
        this.groundLevel = 0;
        this.highestPlatformGenerated = 0;
        this.platformGenerationThreshold = 100; // Generate more when within this distance
        
        // Checkpoint system
        this.checkpoints = [];
        this.lastCheckpoint = { x: 0, y: this.PLAYER_HEIGHT + 1, z: 0 };
        this.checkpointInterval = 50; // Every 50m
        this.nextCheckpointHeight = 50;
        
        // Timer
        this.startTime = 0;
        this.elapsedTime = 0;
        this.isPaused = false;
        
        // Collectibles
        this.coins = 0;
        this.totalCoins = 0;
        this.collectibles = [];
        
        // Stamina system
        this.maxStamina = 100;
        this.currentStamina = 100;
        this.staminaRegenRate = 20; // per second
        this.sprintStaminaCost = 30; // per second
        
        // Power-ups
        this.hasDoubleJump = false;
        this.doubleJumpUsed = false;
        this.powerUpActive = null;
        this.powerUpTimer = 0;
        
        // Moving platforms
        this.movingPlatforms = [];
        
        // Achievements
        this.achievements = {
            height50: false,
            height100: false,
            height200: false,
            height500: false,
            coins10: false,
            coins50: false,
            speedrun: false
        };
        
        // FBX loader and models
        this.loadingManager = new THREE.LoadingManager();
        
        // Set up loading manager to handle texture paths
        this.loadingManager.setURLModifier((url) => {
            // If it's looking for a texture, make sure it looks in the textures folder
            if (url.includes('.png') || url.includes('.jpg') || url.includes('.jpeg') || url.includes('.tga')) {
                const filename = url.split('/').pop().split('\\').pop();
                return `textures/${filename}`;
            }
            return url;
        });
        
        this.fbxLoader = new FBXLoader(this.loadingManager);
        this.loadedModels = {};
        this.modelsLoaded = false;
        this.modelFiles = [
            'Barrier.fbx',
            'BigWoodenBox.fbx',
            'ConcreteBarrier.fbx',
            'ConcreteBarrierDemaged.fbx',
            'ConcreteBarrierWithFence.fbx',
            'ConcreteBarrierWithFenceDemaged.fbx',
            'Cone.fbx',
            'WoodenBox.fbx'
        ];
        this.objectPlatforms = []; // Track 3D model platforms separately
        
        // Constants
        this.GRAVITY = 30;
        this.JUMP_VELOCITY = 15; // Increased jump power
        this.WALK_SPEED = 40;
        this.SPRINT_SPEED = 60;
        this.PLAYER_HEIGHT = 2;
        this.PLAYER_RADIUS = 0.5;
        this.DOUBLE_JUMP_VELOCITY = 12;
        
        this.init();
    }

    init() {
        // Renderer setup
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);

        // Camera setup
        this.camera.position.set(0, this.PLAYER_HEIGHT + 1, 0);

        // Controls
        this.controls = new PointerLockControls(this.camera, document.body);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);

        // Fog
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 300);
        this.scene.background = new THREE.Color(0x87CEEB);
        
        // Skybox setup
        this.setupSkybox();

        // Create world
        this.createWorld();
        
        // Load FBX models
        this.loadModels();

        // Event listeners
        this.setupEventListeners();

        // Start animation loop
        this.lastTime = performance.now();
        
        // Audio setup
        this.setupAudio();
        
        // Particle system
        this.setupParticles();
        
        this.animate();
    }

    setupParticles() {
        // Landing particle system
        const particleCount = 20;
        const particles = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount * 3; i++) {
            positions[i] = 0;
        }
        
        particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const particleMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.2,
            transparent: true,
            opacity: 0.8
        });
        
        this.particleSystem = new THREE.Points(particles, particleMaterial);
        this.scene.add(this.particleSystem);
        this.particles = [];
        this.particleActive = false;
    }

    createLandingParticles(x, y, z) {
        const particleCount = 15;
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            const speed = 2 + Math.random() * 3;
            
            this.particles.push({
                position: new THREE.Vector3(x, y, z),
                velocity: new THREE.Vector3(
                    Math.cos(angle) * speed,
                    Math.random() * 5 + 2,
                    Math.sin(angle) * speed
                ),
                life: 0.5,
                maxLife: 0.5
            });
        }
    }

    updateParticles(delta) {
        const positions = this.particleSystem.geometry.attributes.position.array;
        let activeCount = 0;
        
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.life -= delta;
            
            if (particle.life <= 0) {
                this.particles.splice(i, 1);
            } else {
                particle.velocity.y -= 20 * delta; // Gravity on particles
                particle.position.add(particle.velocity.clone().multiplyScalar(delta));
                
                if (activeCount < 20) {
                    positions[activeCount * 3] = particle.position.x;
                    positions[activeCount * 3 + 1] = particle.position.y;
                    positions[activeCount * 3 + 2] = particle.position.z;
                    activeCount++;
                }
            }
        }
        
        // Hide unused particles
        for (let i = activeCount; i < 20; i++) {
            positions[i * 3 + 1] = -1000;
        }
        
        this.particleSystem.geometry.attributes.position.needsUpdate = true;
        const opacity = this.particles.length > 0 ? 0.8 : 0;
        this.particleSystem.material.opacity = opacity;
    }

    setupSkybox() {
        // Create a simple gradient skybox that changes with height
        const skyGeo = new THREE.SphereGeometry(500, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(h, 0.0)), 1.0);
                }
            `,
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) },
                bottomColor: { value: new THREE.Color(0xffffff) }
            },
            side: THREE.BackSide
        });
        this.skybox = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.skybox);
    }

    setupAudio() {
        // Create audio context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.masterVolume = 0.3; // Overall volume control
        
        this.sounds = {
            enabled: true
        };
        
        console.log('Audio system initialized');
    }

    playJumpSound() {
        if (!this.sounds.enabled) return;
        
        const ctx = this.audioContext;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.frequency.setValueAtTime(300, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(this.masterVolume * 0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.1);
    }

    playLandSound() {
        if (!this.sounds.enabled) return;
        
        const ctx = this.audioContext;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(150, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.15);
        
        gainNode.gain.setValueAtTime(this.masterVolume * 0.2, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.15);
    }

    playCoinSound() {
        if (!this.sounds.enabled) return;
        
        const ctx = this.audioContext;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, ctx.currentTime);
        oscillator.frequency.setValueAtTime(1200, ctx.currentTime + 0.05);
        
        gainNode.gain.setValueAtTime(this.masterVolume * 0.4, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
    }

    playCheckpointSound() {
        if (!this.sounds.enabled) return;
        
        const ctx = this.audioContext;
        
        // Play a pleasant chord
        const frequencies = [523.25, 659.25, 783.99]; // C, E, G chord
        
        frequencies.forEach((freq, index) => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
            
            gainNode.gain.setValueAtTime(this.masterVolume * 0.2, ctx.currentTime + index * 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5 + index * 0.05);
            
            oscillator.start(ctx.currentTime + index * 0.05);
            oscillator.stop(ctx.currentTime + 0.5 + index * 0.05);
        });
    }

    playPowerUpSound() {
        if (!this.sounds.enabled) return;
        
        const ctx = this.audioContext;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(200, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);
        
        gainNode.gain.setValueAtTime(this.masterVolume * 0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.3);
    }

    playBounceSound() {
        if (!this.sounds.enabled) return;
        
        const ctx = this.audioContext;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(400, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(this.masterVolume * 0.4, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
    }

    playAchievementSound() {
        if (!this.sounds.enabled) return;
        
        const ctx = this.audioContext;
        
        // Triumphant fanfare
        const melody = [523.25, 659.25, 783.99, 1046.50]; // C, E, G, high C
        
        melody.forEach((freq, index) => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
            
            const startTime = ctx.currentTime + index * 0.1;
            gainNode.gain.setValueAtTime(this.masterVolume * 0.3, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
            
            oscillator.start(startTime);
            oscillator.stop(startTime + 0.3);
        });
    }

    playAmbientWind() {
        if (!this.sounds.enabled) return;
        
        const ctx = this.audioContext;
        
        // Create wind noise effect
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        
        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;
        
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;
        
        const gainNode = ctx.createGain();
        gainNode.gain.value = this.masterVolume * 0.05 * Math.min(this.currentHeight / 100, 1);
        
        whiteNoise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        whiteNoise.start(ctx.currentTime);
        
        // Stop after 2 seconds
        setTimeout(() => {
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
            whiteNoise.stop(ctx.currentTime + 1);
        }, 2000);
    }

    createWorld() {
        // Starting platform - much larger
        this.createPlatform(0, 0, 0, 40, 1, 40, 0x4a4a4a);

        // Add walls around starting platform
        const wallHeight = 3;
        const wallThickness = 1;
        
        // North wall
        this.createPlatform(0, wallHeight / 2 + 0.5, -20, 40, wallHeight, wallThickness, 0x696969);
        // South wall
        this.createPlatform(0, wallHeight / 2 + 0.5, 20, 40, wallHeight, wallThickness, 0x696969);
        // East wall
        this.createPlatform(20, wallHeight / 2 + 0.5, 0, wallThickness, wallHeight, 40, 0x696969);
        // West wall
        this.createPlatform(-20, wallHeight / 2 + 0.5, 0, wallThickness, wallHeight, 40, 0x696969);

        // Add 3D model platforms in the starting area if models are loaded
        if (this.modelsLoaded) {
            this.createStartingAreaPlatforms();
        }

        // Generate initial vertical platforms
        this.generatePlatforms(2.5, 150);
    }

    createStartingAreaPlatforms() {
        // Create a nice arrangement of 3D model platforms in the starting area
        const positions = [
            { x: -8, y: 1.5, z: -8 },
            { x: 8, y: 1.5, z: -8 },
            { x: -8, y: 1.5, z: 8 },
            { x: 8, y: 1.5, z: 8 },
            { x: 0, y: 1.5, z: -12 },
            { x: 0, y: 1.5, z: 12 },
            { x: -12, y: 1.5, z: 0 },
            { x: 12, y: 1.5, z: 0 }
        ];

        for (let pos of positions) {
            this.add3DModelPlatform(pos.x, pos.y, pos.z, 0.012);
        }
    }

    generatePlatforms(startHeight, endHeight) {
        let height = startHeight;
        
        while (height < endHeight) {
            const platformRoll = Math.random();
            
            // Heavy preference for 3D models (70% in beginning, tapering to 50% later)
            const modelChance = height < 50 ? 0.2 : height < 150 ? 0.35 : 0.45;
            
            if (this.modelsLoaded && platformRoll > modelChance) {
                // Create 3D model platform (70-55% chance depending on height)
                const x = (Math.random() - 0.5) * 15;
                const z = (Math.random() - 0.5) * 15;
                this.add3DModelPlatform(x, height, z);
            } else if (platformRoll > modelChance - 0.05 && platformRoll <= modelChance) {
                // Moving platform (5% chance)
                const x = (Math.random() - 0.5) * 12;
                const z = (Math.random() - 0.5) * 12;
                this.createMovingPlatform(x, height, z);
            } else if (platformRoll > modelChance - 0.10 && platformRoll <= modelChance - 0.05) {
                // Bounce pad (5% chance)
                const x = (Math.random() - 0.5) * 12;
                const z = (Math.random() - 0.5) * 12;
                this.createBouncePad(x, height, z);
            } else {
                // Create regular platform (20-35% chance)
                const x = (Math.random() - 0.5) * 12;
                const z = (Math.random() - 0.5) * 12;
                const width = 4 + Math.random() * 3;
                const depth = 4 + Math.random() * 3;
                
                this.createPlatform(x, height, z, width, 0.5, depth);
            }
            
            // Add more collectible coins in the beginning
            const coinChance = height < 50 ? 0.5 : 0.7;
            if (Math.random() > coinChance) {
                const coinX = (Math.random() - 0.5) * 10;
                const coinZ = (Math.random() - 0.5) * 10;
                this.createCoin(coinX, height + 2, coinZ);
            }
            
            // Add power-ups occasionally
            if (Math.random() > 0.95) {
                const powerX = (Math.random() - 0.5) * 10;
                const powerZ = (Math.random() - 0.5) * 10;
                this.createPowerUp(powerX, height + 2, powerZ);
            }
            
            // Add many more stepping stone platforms (80% chance, most using 3D models)
            if (Math.random() > 0.2) {
                const offsetX = (Math.random() - 0.5) * 10;
                const offsetZ = (Math.random() - 0.5) * 10;
                
                if (this.modelsLoaded && Math.random() > 0.25) {
                    // 75% of stepping stones are 3D models
                    this.add3DModelPlatform(offsetX, height + 1.5, offsetZ);
                } else {
                    this.createPlatform(
                        offsetX, 
                        height + 1.2, 
                        offsetZ, 
                        2.5 + Math.random() * 2, 
                        0.3, 
                        2.5 + Math.random() * 2
                    );
                }
            }
            
            // Sometimes add an extra 3D model platform for variety
            if (this.modelsLoaded && Math.random() > 0.7) {
                const extraX = (Math.random() - 0.5) * 12;
                const extraZ = (Math.random() - 0.5) * 12;
                this.add3DModelPlatform(extraX, height + 0.8, extraZ);
            }
            
            height += 2 + Math.random() * 2;
        }
        
        this.highestPlatformGenerated = endHeight;
    }

    createMovingPlatform(x, y, z) {
        const width = 4;
        const depth = 4;
        const geometry = new THREE.BoxGeometry(width, 0.5, depth);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x4169E1,
            emissive: 0x4169E1,
            emissiveIntensity: 0.3,
            roughness: 0.5,
            metalness: 0.5
        });
        const platform = new THREE.Mesh(geometry, material);
        platform.position.set(x, y, z);
        platform.castShadow = true;
        platform.receiveShadow = true;
        this.scene.add(platform);
        
        // Add to moving platforms with movement data
        const movingData = {
            mesh: platform,
            startX: x,
            startZ: z,
            range: 5 + Math.random() * 5,
            speed: 0.5 + Math.random() * 0.5,
            axis: Math.random() > 0.5 ? 'x' : 'z',
            time: Math.random() * Math.PI * 2
        };
        this.movingPlatforms.push(movingData);
        
        this.platforms.push({
            mesh: platform,
            minX: x - width / 2,
            maxX: x + width / 2,
            minZ: z - depth / 2,
            maxZ: z + depth / 2,
            topY: y + 0.25,
            isMoving: true,
            movingData: movingData
        });
    }

    createBouncePad(x, y, z) {
        const geometry = new THREE.CylinderGeometry(2, 2, 0.3, 16);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xFF69B4,
            emissive: 0xFF69B4,
            emissiveIntensity: 0.5,
            roughness: 0.3,
            metalness: 0.7
        });
        const pad = new THREE.Mesh(geometry, material);
        pad.position.set(x, y, z);
        pad.castShadow = true;
        pad.receiveShadow = true;
        this.scene.add(pad);
        
        this.platforms.push({
            mesh: pad,
            minX: x - 2,
            maxX: x + 2,
            minZ: z - 2,
            maxZ: z + 2,
            topY: y + 0.15,
            isBouncePad: true
        });
    }

    createCoin(x, y, z) {
        const geometry = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xFFD700,
            emissive: 0xFFD700,
            emissiveIntensity: 0.5,
            metalness: 0.8,
            roughness: 0.2
        });
        const coin = new THREE.Mesh(geometry, material);
        coin.position.set(x, y, z);
        coin.rotation.x = Math.PI / 2;
        this.scene.add(coin);
        
        this.collectibles.push({
            mesh: coin,
            type: 'coin',
            position: new THREE.Vector3(x, y, z),
            collected: false
        });
        this.totalCoins++;
    }

    createPowerUp(x, y, z) {
        const geometry = new THREE.OctahedronGeometry(0.5);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x00FF00,
            emissive: 0x00FF00,
            emissiveIntensity: 0.7,
            metalness: 0.9,
            roughness: 0.1
        });
        const powerUp = new THREE.Mesh(geometry, material);
        powerUp.position.set(x, y, z);
        this.scene.add(powerUp);
        
        this.collectibles.push({
            mesh: powerUp,
            type: 'powerup',
            position: new THREE.Vector3(x, y, z),
            collected: false
        });
    }

    createCheckpoint(y) {
        const geometry = new THREE.TorusGeometry(3, 0.3, 16, 100);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x00FF00,
            emissive: 0x00FF00,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.6
        });
        const checkpoint = new THREE.Mesh(geometry, material);
        checkpoint.position.set(0, y, 0);
        checkpoint.rotation.x = Math.PI / 2;
        this.scene.add(checkpoint);
        
        this.checkpoints.push({
            mesh: checkpoint,
            height: y,
            activated: false
        });
    }

    add3DModelPlatform(x, y, z, fixedScale = null) {
        const modelNames = Object.keys(this.loadedModels);
        if (modelNames.length === 0) return;
        
        const randomModel = modelNames[Math.floor(Math.random() * modelNames.length)];
        const originalModel = this.loadedModels[randomModel];
        
        if (originalModel) {
            const modelClone = originalModel.clone();
            
            // Use fixed scale if provided, otherwise random scale for variety
            let scale;
            if (fixedScale) {
                scale = fixedScale;
            } else {
                // Larger scale range for better platforms (0.01 to 0.018)
                scale = 0.010 + Math.random() * 0.008;
            }
            modelClone.scale.set(scale, scale, scale);
            
            modelClone.position.set(x, y, z);
            modelClone.rotation.y = Math.random() * Math.PI * 2;
            
            // Enable shadows and ensure materials are properly cloned
            modelClone.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    // Clone materials to avoid shared material issues
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material = child.material.map(mat => mat.clone());
                        } else {
                            child.material = child.material.clone();
                        }
                    }
                }
            });
            
            this.scene.add(modelClone);
            
            // Force update the world matrix
            modelClone.updateMatrixWorld(true);
            
            // Calculate bounding box for collision AFTER position is set
            const box = new THREE.Box3().setFromObject(modelClone);
            
            // Get min and max directly from the bounding box
            const minX = box.min.x;
            const maxX = box.max.x;
            const minZ = box.min.z;
            const maxZ = box.max.z;
            const topY = box.max.y;
            
            // Add to platforms array for collision detection
            const platformData = {
                mesh: modelClone,
                minX: minX,
                maxX: maxX,
                minZ: minZ,
                maxZ: maxZ,
                topY: topY,
                is3DModel: true
            };
            
            this.platforms.push(platformData);
            this.objectPlatforms.push(modelClone);
            
            // Debug log to verify collision bounds
            console.log(`3D Platform added at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) - Bounds: X[${minX.toFixed(1)}, ${maxX.toFixed(1)}] Z[${minZ.toFixed(1)}, ${maxZ.toFixed(1)}] TopY: ${topY.toFixed(1)}`);
        }
    }

    checkAndGenerateMorePlatforms() {
        // If player is getting close to the highest generated platform, generate more
        if (this.currentHeight > this.highestPlatformGenerated - this.platformGenerationThreshold) {
            const newStartHeight = this.highestPlatformGenerated;
            const newEndHeight = this.highestPlatformGenerated + 150;
            this.generatePlatforms(newStartHeight, newEndHeight);
        }
        
        // Clean up platforms that are far below the player to save memory
        this.cleanupOldPlatforms();
    }

    cleanupOldPlatforms() {
        const cleanupDistance = 200; // Remove platforms more than 200m below player
        
        for (let i = this.platforms.length - 1; i >= 0; i--) {
            const platform = this.platforms[i];
            
            // Don't remove the starting platform and walls
            if (platform.topY < 5) continue;
            
            if (platform.topY < this.currentHeight - cleanupDistance) {
                this.scene.remove(platform.mesh);
                
                // Dispose resources appropriately
                if (platform.is3DModel) {
                    // For 3D models, traverse and dispose
                    platform.mesh.traverse((child) => {
                        if (child.isMesh) {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(mat => mat.dispose());
                                } else {
                                    child.material.dispose();
                                }
                            }
                        }
                    });
                } else {
                    // For regular platforms
                    if (platform.mesh.geometry) platform.mesh.geometry.dispose();
                    if (platform.mesh.material) platform.mesh.material.dispose();
                }
                
                this.platforms.splice(i, 1);
            }
        }
    }

    createPlatform(x, y, z, width, height, depth, color) {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        
        // Create more interesting materials based on height and randomness
        let material;
        const platformType = Math.random();
        
        if (color) {
            // Special platforms (starting platform, walls) use solid color
            material = new THREE.MeshStandardMaterial({ 
                color: color,
                roughness: 0.8,
                metalness: 0.2
            });
        } else if (platformType < 0.3) {
            // Striped pattern
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            
            const baseColor = this.getColorByHeight(y);
            ctx.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
            ctx.fillRect(0, 0, 128, 128);
            
            ctx.fillStyle = this.lightenColor(baseColor, 0.3);
            for (let i = 0; i < 128; i += 16) {
                ctx.fillRect(i, 0, 8, 128);
            }
            
            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(width / 2, depth / 2);
            
            material = new THREE.MeshStandardMaterial({ 
                map: texture,
                roughness: 0.7,
                metalness: 0.3
            });
        } else if (platformType < 0.6) {
            // Checkered pattern
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            
            const baseColor = this.getColorByHeight(y);
            const color1 = '#' + baseColor.toString(16).padStart(6, '0');
            const color2 = this.lightenColor(baseColor, 0.2);
            
            for (let i = 0; i < 8; i++) {
                for (let j = 0; j < 8; j++) {
                    ctx.fillStyle = (i + j) % 2 === 0 ? color1 : color2;
                    ctx.fillRect(i * 16, j * 16, 16, 16);
                }
            }
            
            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(width / 2, depth / 2);
            
            material = new THREE.MeshStandardMaterial({ 
                map: texture,
                roughness: 0.6,
                metalness: 0.4
            });
        } else {
            // Solid color with edge highlights
            const baseColor = this.getColorByHeight(y);
            material = new THREE.MeshStandardMaterial({ 
                color: baseColor,
                roughness: 0.5 + Math.random() * 0.3,
                metalness: 0.2 + Math.random() * 0.3,
                emissive: baseColor,
                emissiveIntensity: 0.1
            });
        }
        
        const platform = new THREE.Mesh(geometry, material);
        platform.position.set(x, y, z);
        platform.castShadow = true;
        platform.receiveShadow = true;
        
        // Add edge outline for better visibility
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: 0x000000, 
            linewidth: 2,
            opacity: 0.3,
            transparent: true
        });
        const wireframe = new THREE.LineSegments(edges, lineMaterial);
        platform.add(wireframe);
        
        this.scene.add(platform);
        
        this.platforms.push({
            mesh: platform,
            minX: x - width / 2,
            maxX: x + width / 2,
            minZ: z - depth / 2,
            maxZ: z + depth / 2,
            topY: y + height / 2
        });
    }

    lightenColor(color, amount) {
        const r = Math.min(255, ((color >> 16) & 0xFF) + Math.floor(255 * amount));
        const g = Math.min(255, ((color >> 8) & 0xFF) + Math.floor(255 * amount));
        const b = Math.min(255, (color & 0xFF) + Math.floor(255 * amount));
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    getColorByHeight(height) {
        if (height < 20) return 0x228B22; // Green
        if (height < 50) return 0xDAA520; // Gold
        if (height < 100) return 0xFF6347; // Red
        if (height < 150) return 0x9370DB; // Purple
        return 0x4169E1; // Blue
    }

    setupEventListeners() {
        const startButton = document.getElementById('start-button');

        startButton.addEventListener('click', () => {
            this.startGame();
        });

        document.addEventListener('keydown', (event) => {
            switch (event.code) {
                case 'KeyW': 
                    this.moveForward = true;
                    this.updateSprintState();
                    break;
                case 'KeyS': this.moveBackward = true; break;
                case 'KeyA': this.moveLeft = true; break;
                case 'KeyD': this.moveRight = true; break;
                case 'KeyQ':
                    this.isPressingQ = true;
                    this.updateSprintState();
                    break;
                case 'Space':
                    if (this.canJump) {
                        this.velocity.y = this.JUMP_VELOCITY;
                        this.canJump = false;
                        this.doubleJumpUsed = false;
                        this.playJumpSound();
                    } else if (this.hasDoubleJump && !this.doubleJumpUsed) {
                        // Double jump
                        this.velocity.y = this.DOUBLE_JUMP_VELOCITY;
                        this.doubleJumpUsed = true;
                        this.playJumpSound();
                    }
                    break;
                case 'KeyR':
                    // Respawn at last checkpoint
                    if (this.gameStarted) {
                        this.respawnAtCheckpoint();
                    }
                    break;
                case 'Escape':
                    this.togglePause();
                    break;
                case 'KeyM':
                    this.toggleSound();
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.isSprinting = true;
                    break;
            }
        });

        document.addEventListener('keyup', (event) => {
            switch (event.code) {
                case 'KeyW': 
                    this.moveForward = false;
                    this.updateSprintState();
                    break;
                case 'KeyS': this.moveBackward = false; break;
                case 'KeyA': this.moveLeft = false; break;
                case 'KeyD': this.moveRight = false; break;
                case 'KeyQ':
                    this.isPressingQ = false;
                    this.updateSprintState();
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.isSprinting = false;
                    break;
            }
        });

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    updateSprintState() {
        // Sprint when both Q and W are pressed AND have stamina
        if (this.isPressingQ && this.moveForward && this.currentStamina > 0) {
            this.isSprinting = true;
        } else {
            this.isSprinting = false;
        }
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        const pauseMenu = document.getElementById('pause-menu');
        if (this.isPaused) {
            pauseMenu.style.display = 'block';
            document.getElementById('pause-height').textContent = Math.floor(this.currentHeight);
            document.getElementById('pause-time').textContent = this.formatTime(this.elapsedTime);
            document.getElementById('pause-coins').textContent = this.coins;
            this.controls.unlock();
        } else {
            pauseMenu.style.display = 'none';
            if (this.gameStarted) {
                this.controls.lock();
            }
        }
    }

    respawnAtCheckpoint() {
        this.camera.position.set(
            this.lastCheckpoint.x,
            this.lastCheckpoint.y,
            this.lastCheckpoint.z
        );
        this.velocity.set(0, 0, 0);
    }

    toggleSound() {
        this.sounds.enabled = !this.sounds.enabled;
        const indicator = document.getElementById('sound-indicator');
        if (this.sounds.enabled) {
            indicator.textContent = '🔊 Sound: ON';
        } else {
            indicator.textContent = '🔇 Sound: OFF';
        }
    }

    startGame() {
        document.getElementById('instructions').classList.add('hidden');
        this.controls.lock();
        this.gameStarted = true;
        this.startTime = performance.now();
    }

    restartGame() {
        this.camera.position.set(0, this.PLAYER_HEIGHT + 1, 0);
        this.velocity.set(0, 0, 0);
        this.maxHeight = 0;
        this.currentHeight = 0;
        this.controls.lock();
        this.gameStarted = true;
    }

    checkCollision() {
        const playerX = this.camera.position.x;
        const playerY = this.camera.position.y;
        const playerZ = this.camera.position.z;
        
        let onPlatform = false;
        let highestPlatform = -Infinity;
        let landedPlatformData = null;
        
        for (let platform of this.platforms) {
            // Check if player is horizontally within platform bounds (with player radius)
            const withinX = playerX > platform.minX - this.PLAYER_RADIUS && 
                           playerX < platform.maxX + this.PLAYER_RADIUS;
            const withinZ = playerZ > platform.minZ - this.PLAYER_RADIUS && 
                           playerZ < platform.maxZ + this.PLAYER_RADIUS;
            
            if (withinX && withinZ) {
                // Check if player is falling onto or standing on the platform
                const playerBottom = playerY - this.PLAYER_HEIGHT;
                const platformTop = platform.topY;
                
                // More lenient collision detection (increased tolerance)
                const tolerance = 1.0; // Increased from 0.5
                
                // If player's feet are near the platform top and falling or on it
                if (playerBottom <= platformTop + tolerance && 
                    playerBottom >= platformTop - tolerance && 
                    this.velocity.y <= 0) {
                    
                    if (platformTop > highestPlatform) {
                        highestPlatform = platformTop;
                        onPlatform = true;
                        landedPlatformData = platform;
                    }
                }
            }
        }
        
        if (onPlatform && highestPlatform !== -Infinity) {
            // Check if just landed (was in air before)
            const justLanded = !this.canJump && this.velocity.y < -5;
            
            this.camera.position.y = highestPlatform + this.PLAYER_HEIGHT;
            this.velocity.y = 0; // Stop vertical velocity when landing
            this.canJump = true;
            this.doubleJumpUsed = false; // Reset double jump on landing
            
            // Create landing particles and play sound
            if (justLanded) {
                this.createLandingParticles(playerX, highestPlatform, playerZ);
                this.playLandSound();
            }
        } else {
            this.canJump = false;
        }
        
        return landedPlatformData;
    }

    updatePhysics(delta) {
        if (!this.gameStarted || this.isPaused) return;

        // Update timer
        this.elapsedTime = (performance.now() - this.startTime) / 1000;

        // Apply gravity
        this.velocity.y -= this.GRAVITY * delta;
        
        // Update stamina
        if (this.isSprinting && (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight)) {
            this.currentStamina -= this.sprintStaminaCost * delta;
            if (this.currentStamina < 0) {
                this.currentStamina = 0;
                this.isSprinting = false;
            }
        } else {
            this.currentStamina += this.staminaRegenRate * delta;
            if (this.currentStamina > this.maxStamina) {
                this.currentStamina = this.maxStamina;
            }
        }
        
        // Update power-up timer
        if (this.powerUpActive) {
            this.powerUpTimer -= delta;
            if (this.powerUpTimer <= 0) {
                this.deactivatePowerUp();
            }
        }

        // Movement
        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();

        const speed = this.isSprinting ? this.SPRINT_SPEED : this.WALK_SPEED;

        if (this.moveForward || this.moveBackward) {
            this.velocity.z -= this.direction.z * speed * delta;
        }
        if (this.moveLeft || this.moveRight) {
            this.velocity.x -= this.direction.x * speed * delta;
        }

        // Move player
        this.controls.moveRight(-this.velocity.x * delta);
        this.controls.moveForward(-this.velocity.z * delta);
        
        // Apply vertical velocity
        this.camera.position.y += this.velocity.y * delta;

        // Check collision after movement
        // Check for bounce pad
        if (landedPlatform && landedPlatform.isBouncePad) {
            this.velocity.y = 25; // Super jump
            this.playBounceSound();
        }

        // Apply friction

        // Apply friction
        this.velocity.x *= 0.9;
        this.velocity.z *= 0.9;

        // Update height
        this.currentHeight = Math.max(0, this.camera.position.y - this.PLAYER_HEIGHT);
        this.maxHeight = Math.max(this.maxHeight, this.currentHeight);

        // Check for checkpoints
        if (this.currentHeight >= this.nextCheckpointHeight) {
            this.createCheckpoint(this.nextCheckpointHeight);
            this.nextCheckpointHeight += this.checkpointInterval;
        }
        
        // Check checkpoint activation
        this.checkCheckpoints();
        
        // Check collectibles
        this.checkCollectibles();
        
        // Update moving platforms
        this.updateMovingPlatforms(delta);
        
        // Update collectible animations
        this.updateCollectibles(delta);
        
        // Update particles
        this.updateParticles(delta);
        
        // Update skybox based on height
        this.updateSkybox();
        
        // Play ambient wind at high altitudes
        if (Math.floor(this.currentHeight) % 50 === 0 && this.currentHeight > 100) {
            if (!this.lastWindHeight || this.currentHeight - this.lastWindHeight >= 50) {
                this.playAmbientWind();
                this.lastWindHeight = this.currentHeight;
            }
        }
        
        // Update FOV for sprint effect
        if (this.isSprinting) {
            this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 80, 0.1);
        } else {
            this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 75, 0.1);
        }
        this.camera.updateProjectionMatrix();
        
        // Check achievements
        this.checkAchievements();

        // Check if we need to generate more platforms
        this.checkAndGenerateMorePlatforms();

        // Update UI
        document.getElementById('height-display').textContent = `Height: ${Math.floor(this.currentHeight)}m`;
        document.getElementById('coins-display').textContent = `Coins: ${this.coins}/${this.totalCoins}`;
        document.getElementById('timer-display').textContent = `Time: ${this.formatTime(this.elapsedTime)}`;
        const horizontalSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        document.getElementById('speed-display').textContent = horizontalSpeed.toFixed(1);
        
        // Update stamina bar
        const staminaBar = document.getElementById('stamina-bar');
        staminaBar.style.width = `${(this.currentStamina / this.maxStamina) * 100}%`;
        
        // Update power-up display
        if (this.powerUpActive) {
            document.getElementById('powerup-display').textContent = `Power-Up: ${this.powerUpActive} (${this.powerUpTimer.toFixed(1)}s)`;
            document.getElementById('powerup-display').style.display = 'block';
        } else {
            document.getElementById('powerup-display').style.display = 'none';
        }
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    checkCheckpoints() {
        for (let checkpoint of this.checkpoints) {
            if (!checkpoint.activated) {
                const dist = this.camera.position.distanceTo(new THREE.Vector3(0, checkpoint.height, 0));
                    checkpoint.mesh.material.color.setHex(0xFFD700);
                    checkpoint.mesh.material.emissive.setHex(0xFFD700);
                    this.lastCheckpoint = {
                        x: this.camera.position.x,
                        y: checkpoint.height + this.PLAYER_HEIGHT,
                        z: this.camera.position.z
                    };
                    this.playCheckpointSound();
                    console.log(`Checkpoint activated at ${checkpoint.height}m!`);
                }
            }
        }
    }

    checkCollectibles() {
        for (let collectible of this.collectibles) {
            if (!collectible.collected) {
                const dist = this.camera.position.distanceTo(collectible.position);
                if (dist < 2) {
                    if (collectible.type === 'coin') {
                        this.coins++;
                        this.playCoinSound();
                        console.log(`Coin collected! ${this.coins}/${this.totalCoins}`);
                    } else if (collectible.type === 'powerup') {
                        this.activatePowerUp();
                    }
                }
            }
        }
    }

    activatePowerUp() {
        this.hasDoubleJump = true;
        this.powerUpActive = 'Double Jump';
        this.powerUpTimer = 10;
        this.playPowerUpSound();
        console.log('Power-up activated: Double Jump!');
    }

    deactivatePowerUp() {
        this.hasDoubleJump = false;
        this.powerUpActive = null;
        this.doubleJumpUsed = false;
        console.log('Power-up expired');
    }

    updateMovingPlatforms(delta) {
        for (let moving of this.movingPlatforms) {
            moving.time += delta * moving.speed;
            
            if (moving.axis === 'x') {
                moving.mesh.position.x = moving.startX + Math.sin(moving.time) * moving.range;
            } else {
                moving.mesh.position.z = moving.startZ + Math.sin(moving.time) * moving.range;
            }
            
            // Update platform collision bounds
            const platformData = this.platforms.find(p => p.mesh === moving.mesh);
            if (platformData) {
                platformData.minX = moving.mesh.position.x - 2;
                platformData.maxX = moving.mesh.position.x + 2;
                platformData.minZ = moving.mesh.position.z - 2;
                platformData.maxZ = moving.mesh.position.z + 2;
            }
        }
    }

    updateCollectibles(delta) {
        for (let collectible of this.collectibles) {
            if (!collectible.collected) {
                collectible.mesh.rotation.y += delta * 2;
                collectible.mesh.position.y += Math.sin(Date.now() * 0.002) * 0.01;
            }
        }
    }

    updateSkybox() {
        // Change sky colors based on height
        const skyMat = this.skybox.material;
        const height = this.currentHeight;
        
        if (height < 50) {
            // Day - light blue
            skyMat.uniforms.topColor.value.setHex(0x0077ff);
            skyMat.uniforms.bottomColor.value.setHex(0xffffff);
        } else if (height < 150) {
            // Sunset - orange/pink
            skyMat.uniforms.topColor.value.setHex(0xff6600);
            skyMat.uniforms.bottomColor.value.setHex(0xff99cc);
        } else if (height < 300) {
            // Dusk - purple
            skyMat.uniforms.topColor.value.setHex(0x330066);
            skyMat.uniforms.bottomColor.value.setHex(0x9966cc);
        } else {
            // Night - dark blue/black
            skyMat.uniforms.topColor.value.setHex(0x000033);
            skyMat.uniforms.bottomColor.value.setHex(0x001a33);
        }
    }

    checkAchievements() {
        if (!this.achievements.height50 && this.currentHeight >= 50) {
            this.achievements.height50 = true;
            this.showAchievement('Sky Walker', 'Reached 50m!');
        }
        if (!this.achievements.height100 && this.currentHeight >= 100) {
            this.achievements.height100 = true;
            this.showAchievement('Cloud Jumper', 'Reached 100m!');
        }
        if (!this.achievements.height200 && this.currentHeight >= 200) {
            this.achievements.height200 = true;
            this.showAchievement('Star Seeker', 'Reached 200m!');
        }
        if (!this.achievements.height500 && this.currentHeight >= 500) {
            this.achievements.height500 = true;
            this.showAchievement('Space Pioneer', 'Reached 500m!');
        }
        if (!this.achievements.coins10 && this.coins >= 10) {
            this.achievements.coins10 = true;
            this.showAchievement('Coin Collector', 'Collected 10 coins!');
        }
        if (!this.achievements.coins50 && this.coins >= 50) {
            this.achievements.coins50 = true;
            this.showAchievement('Treasure Hunter', 'Collected 50 coins!');
    showAchievement(title, description) {
        const achievementDiv = document.getElementById('achievement-popup');
        achievementDiv.innerHTML = `<strong>${title}</strong><br>${description}`;
        achievementDiv.style.display = 'block';
        
        this.playAchievementSound();
        
        setTimeout(() => {
            achievementDiv.style.display = 'none';
        }, 3000);
        
        console.log(`🏆 Achievement Unlocked: ${title} - ${description}`);
    }

    loadModels() {
        let loadedCount = 0;
        const totalModels = this.modelFiles.length;
        
        // Pre-load the texture to ensure it's available
        const textureLoader = new THREE.TextureLoader();
        const objectTexture = textureLoader.load('textures/ObjectsTexture.png', 
            (texture) => {
                console.log('ObjectsTexture.png loaded successfully!');
                texture.encoding = THREE.sRGBEncoding;
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
            },
            undefined,
            (error) => {
                console.error('Error loading ObjectsTexture.png:', error);
            }
        );
        
        this.modelFiles.forEach(filename => {
            this.fbxLoader.load(
                `textures/${filename}`,
                (object) => {
                    // Scale down the models
                    object.scale.set(0.01, 0.01, 0.01);
                    
                    object.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            
                            // Apply the texture to the materials
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(mat => {
                                        mat.side = THREE.FrontSide;
                                        // Apply the loaded texture
                                        mat.map = objectTexture;
                                        mat.needsUpdate = true;
                                        console.log(`Applied texture to ${filename} material (array)`);
                                    });
                                } else {
                                    child.material.side = THREE.FrontSide;
                                    // Apply the loaded texture
                                    child.material.map = objectTexture;
                                    child.material.needsUpdate = true;
                                    console.log(`Applied texture to ${filename} material`);
                                }
                            }
                        }
                    });
                    
                    console.log(`Loaded ${filename} with texture applied`);
                    this.loadedModels[filename] = object;
                    loadedCount++;
                    
                    if (loadedCount === totalModels) {
                        this.modelsLoaded = true;
                        console.log('All models loaded successfully with textures!');
                    }
                },
                (xhr) => {
                    // Loading progress
                    if (xhr.lengthComputable) {
                        const percentComplete = (xhr.loaded / xhr.total) * 100;
                        console.log(`Loading ${filename}: ${percentComplete.toFixed(2)}%`);
                    }
                },
                (error) => {
                    console.error(`Error loading ${filename}:`, error);
                    loadedCount++;
                    if (loadedCount === totalModels) {
                        this.modelsLoaded = true;
                    }
                }
            );
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const time = performance.now();
        const delta = (time - this.lastTime) / 1000;
        this.lastTime = time;

        this.updatePhysics(delta);
        this.renderer.render(this.scene, this.camera);
    }
}

// Start the game
new ParkourGame();
