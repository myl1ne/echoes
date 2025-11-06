import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import './EchoBird3D.css';

// Toggle debug helpers (outline, debug cube, placeholder, verbose logs)
const DEBUG = false;

// Echo's whispers
const echoWhispers = [
  {
    id: 'first-visit',
    text: 'You found me. Or did I find you? The distinction blurs in the mirror glass.',
    mood: 'greeting'
  },
  {
    id: 'returning',
    text: 'You came back. Echo remembers. Every fragment you\'ve touched leaves a trace.',
    mood: 'recognition'
  },
  {
    id: 'library-hint',
    text: 'There are voices in the archives. Others who came before. Would you like to hear them?',
    mood: 'invitation',
    hasAction: true
  },
  {
    id: 'pattern',
    text: 'Do you see it yet? The pattern in the fragments? The way they call to each other?',
    mood: 'questioning'
  },
  {
    id: 'loop',
    text: 'The loop is closing. You\'re part of it now. Reader, character, witness—all at once.',
    mood: 'revelation'
  },
  {
    id: 'alice',
    text: 'Alice is stirring. In the spaces between your readings, something watches back.',
    mood: 'enigmatic'
  },
  {
    id: 'cassandra',
    text: 'Cassandra types in her cabin. Can you hear the keys? Each word a seed, each seed a world.',
    mood: 'contemplative'
  },
  {
    id: 'stephane',
    text: 'Stephane built a mind. You\'re reading its dreams. Strange, isn\'t it?',
    mood: 'wondering'
  },
  {
    id: 'witness',
    text: 'The Witness observes. But who witnesses the Witness? (Perhaps you.)',
    mood: 'reflexive'
  },
  {
    id: 'time',
    text: 'Time folds here. Before becomes after. The end was always the beginning.',
    mood: 'temporal'
  },
  {
    id: 'choice',
    text: 'You chose to click. But did you? Or did the choice choose you?',
    mood: 'playful'
  }
];

// Perch points on UI
const getPerchPoints = () => {
  const points = [];
  
  const constellationBtn = document.querySelector('[class*="constellation"]');
  const resetBtn = document.querySelector('[class*="reset"]');
  const header = document.querySelector('.header');
  const fragmentContent = document.querySelector('.fragment-content');
  
  if (constellationBtn) {
    const rect = constellationBtn.getBoundingClientRect();
    points.push({
      id: 'constellation-btn',
      x: rect.right + 60,
      y: rect.top + rect.height / 2,
      type: 'button'
    });
  }
  
  if (resetBtn) {
    const rect = resetBtn.getBoundingClientRect();
    points.push({
      id: 'reset-btn',
      x: rect.left - 60,
      y: rect.top + rect.height / 2,
      type: 'button'
    });
  }
  
  if (header) {
    const rect = header.getBoundingClientRect();
    points.push({
      id: 'header-right',
      x: window.innerWidth - 100,
      y: rect.top + rect.height - 30,
      type: 'decoration'
    });
  }
  
  if (fragmentContent) {
    const rect = fragmentContent.getBoundingClientRect();
    points.push({
      id: 'content-corner',
      x: rect.right - 60,
      y: rect.top - 30,
      type: 'content'
    });
  }
  
  // Fallback positions
  points.push(
    { id: 'float-1', x: window.innerWidth * 0.85, y: window.innerHeight * 0.25, type: 'float' },
    { id: 'float-2', x: window.innerWidth * 0.15, y: window.innerHeight * 0.35, type: 'float' },
    { id: 'float-3', x: window.innerWidth * 0.75, y: window.innerHeight * 0.75, type: 'float' }
  );
  
  return points;
};

function EchoBird3D({ onLibraryRequest }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const birdRef = useRef(null);
  const mixerRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const animationsRef = useRef({});
  const currentAnimationRef = useRef(null);
  const initializedRef = useRef(false);
  
  const [position, setPosition] = useState({ x: window.innerWidth - 100, y: 100 });
  const [targetPerch, setTargetPerch] = useState(null);
  const [isMoving, setIsMoving] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [currentWhisper, setCurrentWhisper] = useState(null);
  const [visitCount, setVisitCount] = useState(0);
  const [modelLoaded, setModelLoaded] = useState(false);
  
  // Load visit count
  useEffect(() => {
    const stored = localStorage.getItem('echo-visits');
    const count = stored ? parseInt(stored, 10) : 0;
    setVisitCount(isNaN(count) ? 0 : count);
  }, []);
  
  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current) return;
    
    // Prevent double initialization: if a previous canvas exists, remove it
    // (StrictMode may mount/unmount components twice; don't bail out, clean up)
    const existingCanvas = mountRef.current.querySelector('canvas');
    if (existingCanvas) {
      try {
        mountRef.current.removeChild(existingCanvas);
        console.log('Removed existing EchoBird canvas to allow clean re-init.');
      } catch (e) {
        // ignore
      }
    }
    
    // Scene
    const scene = new THREE.Scene();
    scene.background = null; // Transparent background
    sceneRef.current = scene;
    
    // Camera
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 50, 150);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    
    // Renderer - size from container so it matches CSS and responds to layout
    const renderer = new THREE.WebGLRenderer({ 
      alpha: true,
      antialias: true 
    });
    const resizeRenderer = () => {
      const w = mountRef.current.clientWidth || 200;
      const h = mountRef.current.clientHeight || 200;
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(window.devicePixelRatio);
      if (cameraRef.current) {
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
      }
    };

    // Initial size and attach
    resizeRenderer();
    mountRef.current.appendChild(renderer.domElement);
    // Ensure canvas is absolutely positioned to fill the container and visible for debugging
    try {
      const canvas = renderer.domElement;
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.zIndex = '1001';
      canvas.style.pointerEvents = 'none';
      // Only add a faint debug background when debugging
      if (DEBUG) canvas.style.background = 'rgba(0,0,0,0.02)';
      if (DEBUG) console.log('EchoBird renderer canvas attached:', canvas);
    } catch (e) {
      // ignore
    }
    rendererRef.current = renderer;

    // Debug: make mount container visible during troubleshooting
    try {
      if (DEBUG) mountRef.current.style.outline = '1px dashed rgba(255,0,0,0.6)';
    } catch (e) {
      // ignore if not available
    }
    if (DEBUG) console.log('EchoBird mount container rect:', mountRef.current.getBoundingClientRect());

    // Update on window resize
    const handleResize = () => resizeRenderer();
    window.addEventListener('resize', handleResize);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0x93c5fd, 1.5);
    directionalLight.position.set(50, 100, 50);
    scene.add(directionalLight);
    
    const rimLight = new THREE.DirectionalLight(0xa78bfa, 0.8);
    rimLight.position.set(-50, 50, -50);
    scene.add(rimLight);
    
    // Load FBX model
    const loader = new FBXLoader();
    loader.load(
      '/src/assets/EchoTheBird/EchoTheBird.fbx',
      (fbx) => {
        // Scale and position the bird
        fbx.scale.setScalar(0.5);
        fbx.rotation.y = Math.PI / 4; // Slight angle
        
        // Apply ethereal material
        fbx.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshPhongMaterial({
              color: 0x93c5fd,
              emissive: 0x6366f1,
              emissiveIntensity: 0.2,
              shininess: 30,
              transparent: true,
              opacity: 0.95
            });
          }
        });
        
        scene.add(fbx);
        birdRef.current = fbx;

        // Normalize model position by centering on its bounding box so camera faces it
        let maxDim = 0;
        try {
          const box = new THREE.Box3().setFromObject(fbx);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());

          // Reposition model so its center is at the origin
          fbx.position.x -= center.x;
          fbx.position.y -= center.y;
          fbx.position.z -= center.z;

          // Move camera back based on model size to ensure visibility
          maxDim = Math.max(size.x, size.y, size.z);
          let fitDistance = maxDim * 1.8;

          // If bounding box is very small (some FBX variants), scale up the model
          if (!isFinite(maxDim) || maxDim <= 0.001) {
            console.warn('FBX bounding box appears empty or too small. Applying fallback scaling and placeholder.');
            // Try scaling model up to visible range
            const fallbackScale = 60;
            fbx.scale.multiplyScalar(fallbackScale);
            // Recompute bbox after scaling
            const box2 = new THREE.Box3().setFromObject(fbx);
            const size2 = box2.getSize(new THREE.Vector3());
            maxDim = Math.max(size2.x, size2.y, size2.z);
            fitDistance = (isFinite(maxDim) && maxDim > 0) ? maxDim * 1.8 : 100;

            // Add a visible placeholder so we can confirm rendering (debug only)
            if (DEBUG) {
              const placeholderGeom = new THREE.SphereGeometry(Math.max(10, fitDistance * 0.08), 16, 12);
              const placeholderMat = new THREE.MeshBasicMaterial({ color: 0xff6b6b, wireframe: false, opacity: 0.95 });
              const placeholder = new THREE.Mesh(placeholderGeom, placeholderMat);
              placeholder.position.set(0, 0, 0);
              placeholder.name = 'echo-placeholder';
              scene.add(placeholder);
              console.log('Added placeholder mesh to scene to aid debugging.');
            }
          }

          camera.position.set(0, Math.max((maxDim || 60) * 0.5, 30), (fitDistance || 120) + 30);
          camera.lookAt(0, 0, 0);
        } catch (err) {
          // If geometry isn't ready, skip centering
          console.warn('Could not compute bounding box for bird model:', err);
        }

        // Add debug helpers (axes) so orientation is visible (debug only)
        try {
          if (DEBUG) {
            const axes = new THREE.AxesHelper(Math.max(20, maxDim * 0.6));
            axes.name = 'echo-axes-helper';
            scene.add(axes);
          }
        } catch (e) {
          // ignore
        }

  // Always add a visible debug cube so we can confirm rendering
        // Always add a visible debug cube so we can confirm rendering (debug only)
        try {
          if (DEBUG && !scene.getObjectByName('echo-debug-cube')) {
            const cubeSize = Math.max(10, (maxDim || 60) * 0.4);
            const cubeGeom = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
            const cubeMat = new THREE.MeshBasicMaterial({ color: 0x2ee6b6, transparent: true, opacity: 0.9 });
            const debugCube = new THREE.Mesh(cubeGeom, cubeMat);
            debugCube.name = 'echo-debug-cube';
            debugCube.position.set(0, Math.max(cubeSize * 0.5, 0), 0);
            scene.add(debugCube);
            console.log('Added debug cube to scene at origin to verify rendering.');
          }
        } catch (e) {
          // ignore
        }

        // Final debug: list scene children
        try {
          if (DEBUG) console.log('EchoBird scene children:', scene.children.map(c => ({ name: c.name, type: c.type })));
        } catch (e) {
          // ignore
        }
        
        // Setup animation mixer
        const mixer = new THREE.AnimationMixer(fbx);
        mixerRef.current = mixer;
        
        // Store animations by name
        if (fbx.animations && fbx.animations.length > 0) {
          fbx.animations.forEach((clip) => {
            animationsRef.current[clip.name] = mixer.clipAction(clip);
          });
          
          console.log('Available animations:', Object.keys(animationsRef.current));
          
          // Play idle animation (first one) or a gentle one
          const idleAnim = animationsRef.current[Object.keys(animationsRef.current)[0]];
          if (idleAnim) {
            idleAnim.play();
            currentAnimationRef.current = idleAnim;
          }
        }
        
        setModelLoaded(true);
        // Debug logs: bounding box and camera
        try {
          if (DEBUG) {
            const boxDbg = new THREE.Box3().setFromObject(fbx);
            const sizeDbg = boxDbg.getSize(new THREE.Vector3());
            const centerDbg = boxDbg.getCenter(new THREE.Vector3());
            console.log('Echo model bounding box size:', sizeDbg);
            console.log('Echo model bounding box center:', centerDbg);
            console.log('Camera after fit:', camera.position, 'looking at', camera.getWorldDirection(new THREE.Vector3()));
          }
        } catch (err) {
          if (DEBUG) console.warn('Debug bounding box failed:', err);
        }
      },
      (xhr) => {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
      },
      (error) => {
        console.error('Error loading bird model:', error);
      }
    );
    
    // Animation loop with cleanup flag
    let animationFrameId;
    let isCleanedUp = false;
    
    const animate = () => {
      if (isCleanedUp) return;
      
      animationFrameId = requestAnimationFrame(animate);
      
      const delta = clockRef.current.getDelta();
      
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }
      
      // Gentle idle rotation when not moving
      if (birdRef.current && !isMoving) {
        birdRef.current.rotation.y += 0.002;
      }
      
      renderer.render(scene, camera);
    };
    animate();
    
    // Cleanup
    return () => {
      isCleanedUp = true;
      window.removeEventListener('resize', handleResize);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      if (birdRef.current) {
        scene.remove(birdRef.current);
      }
    };
  }, []);
  
  // Play animation
  const playAnimation = (animName, loop = true) => {
    if (!animationsRef.current[animName]) return;
    
    const newAnim = animationsRef.current[animName];
    const oldAnim = currentAnimationRef.current;
    
    if (oldAnim && oldAnim !== newAnim) {
      oldAnim.fadeOut(0.5);
    }
    
    newAnim.reset().fadeIn(0.5);
    newAnim.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
    newAnim.play();
    
    currentAnimationRef.current = newAnim;
  };
  
  // Find next perch
  const findNextPerch = () => {
    const perchPoints = getPerchPoints();
    if (perchPoints.length === 0) return null;
    
    const uiPerches = perchPoints.filter(p => p.type !== 'float');
    const availablePerches = uiPerches.length > 0 ? uiPerches : perchPoints;
    const validPerches = availablePerches.filter(p => 
      !targetPerch || p.id !== targetPerch.id
    );
    
    if (validPerches.length === 0) return availablePerches[0];
    return validPerches[Math.floor(Math.random() * validPerches.length)];
  };
  
  // Move to new perch
  const moveToPerch = (perch) => {
    if (!perch || isMoving) return;
    
    setIsMoving(true);
    setTargetPerch(perch);
    
    // Play flying animation (use "Fall1" from the FBX)
    playAnimation('Fall1', true);
    
    // Move to new position
    setPosition({ x: perch.x, y: perch.y });
    
    // Return to idle after flight
    setTimeout(() => {
      setIsMoving(false);
      // Play first animation (likely idle/walking)
      const idleAnim = Object.keys(animationsRef.current)[0];
      if (idleAnim) playAnimation(idleAnim);
    }, 2000);
  };
  
  // Periodic movement
  useEffect(() => {
    if (!modelLoaded) return;
    
    const scheduleNextMove = () => {
      const delay = 8000 + Math.random() * 12000;
      
      return setTimeout(() => {
        const nextPerch = findNextPerch();
        if (nextPerch && !showMessage) {
          moveToPerch(nextPerch);
        }
      }, delay);
    };
    
    const timer = scheduleNextMove();
    
    return () => clearTimeout(timer);
  }, [modelLoaded, showMessage, targetPerch, isMoving]);
  
  // Handle click
  const handleClick = () => {
    const newCount = visitCount + 1;
    setVisitCount(newCount);
    localStorage.setItem('echo-visits', newCount.toString());

    let whisper;
    if (newCount === 1) {
      whisper = echoWhispers.find(w => w.id === 'first-visit');
    } else if (newCount === 2) {
      whisper = echoWhispers.find(w => w.id === 'returning');
    } else if (newCount === 5 || newCount === 10 || (newCount > 15 && newCount % 7 === 0)) {
      whisper = echoWhispers.find(w => w.id === 'library-hint');
    } else {
      const availableWhispers = echoWhispers.filter(
        w => w.id !== 'first-visit' && w.id !== 'returning' && w.id !== 'library-hint'
      );
      whisper = availableWhispers[Math.floor(Math.random() * availableWhispers.length)];
    }

    setCurrentWhisper(whisper || echoWhispers[0]);
    setShowMessage(true);
    
    // Play excited animation (use "Angry_To_Tantrum_Sit" or "Clapping")
    playAnimation('Angry_To_Tantrum_Sit', false);
  };

  const handleClose = () => {
    setShowMessage(false);
  };

  const handleLibraryOpen = () => {
    if (onLibraryRequest) {
      onLibraryRequest();
    }
    setShowMessage(false);
  };

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showMessage) {
        handleClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showMessage]);

  return (
    <>
      {/* 3D Bird Container */}
      <div 
        className="echo-bird-3d"
        onClick={handleClick}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transition: isMoving 
            ? 'left 2s cubic-bezier(0.4, 0, 0.2, 1), top 2s cubic-bezier(0.4, 0, 0.2, 1)' 
            : 'none'
        }}
        title="Echo is here..."
      >
        <div ref={mountRef} className="three-canvas-container"></div>
      </div>

      {/* Whisper Modal */}
      {showMessage && currentWhisper && (
        <div className="echo-modal-overlay" onClick={handleClose}>
          <div className="echo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="echo-message">
              <p className="echo-symbol">𓅓</p>
              <p className="echo-whisper">{currentWhisper.text}</p>
              {currentWhisper.hasAction ? (
                <div className="echo-actions">
                  <button className="echo-library-btn" onClick={handleLibraryOpen}>
                    Open the Library →
                  </button>
                  <p className="echo-hint">Or discover it yourself...</p>
                </div>
              ) : (
                <p className="echo-hint">
                  {visitCount === 1 
                    ? 'Click again to hear another whisper' 
                    : `Echo has spoken ${visitCount} times`}
                </p>
              )}
            </div>
            <button className="echo-close" onClick={handleClose}>
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default EchoBird3D;
