import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

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
        
        // Constants
        this.GRAVITY = 30;
        this.JUMP_VELOCITY = 15; // Increased jump power
        this.WALK_SPEED = 40;
        this.SPRINT_SPEED = 60;
        this.PLAYER_HEIGHT = 2;
        this.PLAYER_RADIUS = 0.5;
        
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

        // Create world
        this.createWorld();

        // Event listeners
        this.setupEventListeners();

        // Start animation loop
        this.lastTime = performance.now();
        this.animate();
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

        // Generate initial vertical platforms
        this.generatePlatforms(2.5, 150);
    }

    generatePlatforms(startHeight, endHeight) {
        let height = startHeight;
        
        while (height < endHeight) {
            const x = (Math.random() - 0.5) * 12;
            const z = (Math.random() - 0.5) * 12;
            const width = 4 + Math.random() * 3;
            const depth = 4 + Math.random() * 3;
            
            this.createPlatform(x, height, z, width, 0.5, depth);
            
            // Add some stepping stone platforms between main platforms
            if (Math.random() > 0.5) {
                const offsetX = (Math.random() - 0.5) * 8;
                const offsetZ = (Math.random() - 0.5) * 8;
                this.createPlatform(
                    x + offsetX, 
                    height + 1.2, 
                    z + offsetZ, 
                    2.5 + Math.random() * 2, 
                    0.3, 
                    2.5 + Math.random() * 2
                );
            }
            
            // Add occasional floating cubes as obstacles
            if (Math.random() > 0.8) {
                const cubeX = (Math.random() - 0.5) * 20;
                const cubeZ = (Math.random() - 0.5) * 20;
                const size = 1 + Math.random() * 2;
                
                const geometry = new THREE.BoxGeometry(size, size, size);
                const material = new THREE.MeshStandardMaterial({ 
                    color: Math.random() * 0xffffff,
                    roughness: 0.7,
                    metalness: 0.3
                });
                const cube = new THREE.Mesh(geometry, material);
                cube.position.set(cubeX, height, cubeZ);
                cube.castShadow = true;
                cube.receiveShadow = true;
                cube.rotation.set(
                    Math.random() * Math.PI,
                    Math.random() * Math.PI,
                    Math.random() * Math.PI
                );
                this.scene.add(cube);
            }
            
            height += 2 + Math.random() * 2;
        }
        
        this.highestPlatformGenerated = endHeight;
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
                platform.mesh.geometry.dispose();
                platform.mesh.material.dispose();
                this.platforms.splice(i, 1);
            }
        }
    }

    createPlatform(x, y, z, width, height, depth, color) {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshStandardMaterial({ 
            color: color || this.getColorByHeight(y),
            roughness: 0.8,
            metalness: 0.2
        });
        const platform = new THREE.Mesh(geometry, material);
        platform.position.set(x, y, z);
        platform.castShadow = true;
        platform.receiveShadow = true;
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
                    }
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
        // Sprint when both Q and W are pressed
        if (this.isPressingQ && this.moveForward) {
            this.isSprinting = true;
        } else {
            this.isSprinting = false;
        }
    }

    startGame() {
        document.getElementById('instructions').classList.add('hidden');
        this.controls.lock();
        this.gameStarted = true;
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
        
        for (let platform of this.platforms) {
            // Check if player is horizontally within platform bounds (with player radius)
            if (playerX > platform.minX - this.PLAYER_RADIUS && 
                playerX < platform.maxX + this.PLAYER_RADIUS &&
                playerZ > platform.minZ - this.PLAYER_RADIUS && 
                playerZ < platform.maxZ + this.PLAYER_RADIUS) {
                
                // Check if player is falling onto or standing on the platform
                const playerBottom = playerY - this.PLAYER_HEIGHT;
                const platformTop = platform.topY;
                
                // If player's feet are near the platform top and falling or on it
                if (playerBottom <= platformTop + 0.5 && playerBottom >= platformTop - 0.5 && this.velocity.y <= 0) {
                    if (platformTop > highestPlatform) {
                        highestPlatform = platformTop;
                        onPlatform = true;
                    }
                }
            }
        }
        
        if (onPlatform && highestPlatform !== -Infinity) {
            this.camera.position.y = highestPlatform + this.PLAYER_HEIGHT;
            this.velocity.y = 0; // Stop vertical velocity when landing
            this.canJump = true;
        } else {
            this.canJump = false;
        }
        
        return onPlatform;
    }

    updatePhysics(delta) {
        if (!this.gameStarted) return;

        // Apply gravity
        this.velocity.y -= this.GRAVITY * delta;

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
        this.checkCollision();

        // Apply friction
        this.velocity.x *= 0.9;
        this.velocity.z *= 0.9;

        // Update height
        this.currentHeight = Math.max(0, this.camera.position.y - this.PLAYER_HEIGHT);
        this.maxHeight = Math.max(this.maxHeight, this.currentHeight);

        // Check if we need to generate more platforms
        this.checkAndGenerateMorePlatforms();

        // Update UI
        document.getElementById('height-display').textContent = `Height: ${Math.floor(this.currentHeight)}m`;
        const horizontalSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
        document.getElementById('speed-display').textContent = horizontalSpeed.toFixed(1);
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
