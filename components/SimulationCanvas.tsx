import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { BFFSimulation, generatePalette } from '../services/bffSimulation';

interface SimulationCanvasProps {
  simulation: BFFSimulation;
  running: boolean;
  speed: number;
  onCellClick?: (x: number, y: number) => void;
}

const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  // Flip Y so vUv=(0,0) is top-left visual corner
  vUv.y = 1.0 - vUv.y; 
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uState;
uniform sampler2D uPalette;
uniform float uGridSize;   // e.g., 64.0 for 64x64 grid
uniform float uBlockSize;  // e.g., 8.0 for 64-byte tape (8x8 visual block)
uniform float uTexSize;    // Width/Height of the state texture

varying vec2 vUv;

void main() {
  // 1. Grid Coordinates (0 .. GridSize-1)
  vec2 gridPos = floor(vUv * uGridSize);
  
  // 2. Byte Coordinates within the visual block (0 .. BlockSize-1)
  vec2 bytePos = floor(fract(vUv * uGridSize) * uBlockSize);
  
  // 3. Calculate Linear Byte Index in the Tape
  float byteIndex = bytePos.y * uBlockSize + bytePos.x;

  // 4. Calculate Global Linear Index safely
  float cellIndex = gridPos.y * uGridSize + gridPos.x;
  float tapeSize = uBlockSize * uBlockSize;
  float globalIndex = cellIndex * tapeSize + byteIndex;

  // 5. Map Global Linear Index to Texture Coordinates
  float texRow = floor(globalIndex / uTexSize);
  float texCol = mod(globalIndex, uTexSize);
  
  // 6. Convert to UV for Texture Sampling
  vec2 texUV = vec2(
    (texCol + 0.5) / uTexSize,
    (texRow + 0.5) / uTexSize
  );

  // 7. Sample State
  vec4 val = texture2D(uState, texUV);
  
  // 8. Palette Lookup
  float index = val.r;
  float pCoord = index * (255.0 / 256.0) + (0.5 / 256.0);
  gl_FragColor = texture2D(uPalette, vec2(pCoord, 0.5));
}
`;

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ simulation, running, speed, onCellClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Layout State
  const [containerRect, setContainerRect] = useState({ width: 1, height: 1 });
  
  // Transform State: x, y are offsets in pixels relative to the container's top-left
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isDragging, setIsDragging] = useState(false);

  // Gesture State Ref (to avoid closures issues in event handlers)
  const gesture = useRef({
    startX: 0,
    startY: 0,
    startTransformX: 0,
    startTransformY: 0,
    // Pinch specific
    isPinching: false,
    wasPinching: false, // Tracks if a pinch occurred during the current interaction sequence
    startDist: 0,
    startK: 1,
    pinchCenterX: 0,
    pinchCenterY: 0,
    hasMoved: false
  });

  // Calculate the square size for the board (fitting within the container)
  const baseSize = Math.min(containerRect.width, containerRect.height);
  
  // Dimensions for Shader
  const gridSize = simulation.config.gridWidth; 
  const tapeSize = simulation.config.tapeSize;
  const blockSize = Math.ceil(Math.sqrt(tapeSize));

  // --- Layout Observer ---
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    
    // Fix: Accept optional entries to satisfy ResizeObserverCallback signature
    const updateSize = (_entries?: ResizeObserverEntry[]) => {
        if (!containerRef.current) return;
        const { width, height } = containerRef.current.getBoundingClientRect();
        setContainerRect({ width, height });
        
        // For first load, force centering:
        if (transform.k === 1 && transform.x === 0 && transform.y === 0) {
            const size = Math.min(width, height);
            setTransform({
                x: (width - size) / 2,
                y: (height - size) / 2,
                k: 1
            });
        }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    
    return () => observer.disconnect();
  }, []);

  // --- Transform Logic ---

  const applyConstraints = (x: number, y: number, k: number) => {
      const scaledSize = baseSize * k;
      const cw = containerRect.width;
      const ch = containerRect.height;

      let newX = x;
      let newY = y;

      // X Constraint
      if (scaledSize <= cw) {
          // Center if smaller than viewport
          newX = (cw - scaledSize) / 2;
      } else {
          newX = Math.min(0, Math.max(cw - scaledSize, x));
      }

      // Y Constraint
      if (scaledSize <= ch) {
          newY = (ch - scaledSize) / 2;
      } else {
          newY = Math.min(0, Math.max(ch - scaledSize, y));
      }

      // Zoom Constraint
      const newK = Math.min(Math.max(1, k), 22); // Max zoom ~22x
      
      return { x: newX, y: newY, k: newK };
  };

  const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      
      const { left, top } = containerRef.current!.getBoundingClientRect();
      const mouseX = e.clientX - left;
      const mouseY = e.clientY - top;

      const zoomIntensity = 0.1;
      const direction = e.deltaY > 0 ? -1 : 1;
      const factor = 1 + (zoomIntensity * direction);
      
      const targetK = transform.k * factor;
      const clampedK = Math.min(Math.max(1, targetK), 22);
      const actualFactor = clampedK / transform.k;

      const newX = mouseX - (mouseX - transform.x) * actualFactor;
      const newY = mouseY - (mouseY - transform.y) * actualFactor;

      setTransform(applyConstraints(newX, newY, clampedK));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
      // If already pinching, don't interrupt
      if (gesture.current.isPinching) return;

      // Reset state on primary touch/click
      if (e.isPrimary) {
        gesture.current.wasPinching = false;
        gesture.current.hasMoved = false;
      }
      
      gesture.current.startX = e.clientX;
      gesture.current.startY = e.clientY;
      gesture.current.startTransformX = transform.x;
      gesture.current.startTransformY = transform.y;
      
      setIsDragging(true);
      if (containerRef.current) containerRef.current.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!isDragging || gesture.current.isPinching) return;

      const dx = e.clientX - gesture.current.startX;
      const dy = e.clientY - gesture.current.startY;
      
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) gesture.current.hasMoved = true;

      const newX = gesture.current.startTransformX + dx;
      const newY = gesture.current.startTransformY + dy;

      setTransform(applyConstraints(newX, newY, transform.k));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      // Only proceed if we were actively dragging/interacting. 
      // This prevents 'hover-leave' events from triggering clicks.
      if (!isDragging) return;

      setIsDragging(false);
      if (containerRef.current) containerRef.current.releasePointerCapture(e.pointerId);
      
      // Click Handler: ONLY triggers if we haven't dragged AND we haven't pinched
      if (!gesture.current.hasMoved && !gesture.current.isPinching && !gesture.current.wasPinching && onCellClick && canvasRef.current) {
         const rect = containerRef.current!.getBoundingClientRect();
         const clickX = e.clientX - rect.left;
         const clickY = e.clientY - rect.top;

         const contentX = clickX - transform.x;
         const contentY = clickY - transform.y;
         const currentSize = baseSize * transform.k;
         
         if (contentX >= 0 && contentX <= currentSize && contentY >= 0 && contentY <= currentSize) {
             const u = contentX / currentSize;
             const v = contentY / currentSize;
             const gridX = Math.floor(u * gridSize);
             const gridY = Math.floor(v * gridSize);
             
             if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
                 onCellClick(gridX, gridY);
             }
         }
      }
  };

  // --- Touch Gesture Logic (Pinch) ---
  const handleTouchStart = (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
          gesture.current.isPinching = true;
          gesture.current.wasPinching = true; // Mark that a pinch happened in this interaction
          
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          
          const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
          const cx = (t1.clientX + t2.clientX) / 2;
          const cy = (t1.clientY + t2.clientY) / 2;
          
          const rect = containerRef.current!.getBoundingClientRect();
          
          gesture.current.startDist = dist;
          gesture.current.startK = transform.k;
          gesture.current.pinchCenterX = cx - rect.left;
          gesture.current.pinchCenterY = cy - rect.top;
          gesture.current.startTransformX = transform.x;
          gesture.current.startTransformY = transform.y;
      }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (gesture.current.isPinching && e.touches.length === 2) {
          e.preventDefault();
          
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          
          const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
          const cx = (t1.clientX + t2.clientX) / 2;
          const cy = (t1.clientY + t2.clientY) / 2;
          const rect = containerRef.current!.getBoundingClientRect();
          
          const currentCenterX = cx - rect.left;
          const currentCenterY = cy - rect.top;

          const scaleFactor = dist / gesture.current.startDist;
          const targetK = gesture.current.startK * scaleFactor;
          const clampedK = Math.min(Math.max(1, targetK), 22);
          
          const effectiveFactor = clampedK / gesture.current.startK;
          
          const newX = currentCenterX - (gesture.current.pinchCenterX - gesture.current.startTransformX) * effectiveFactor;
          const newY = currentCenterY - (gesture.current.pinchCenterY - gesture.current.startTransformY) * effectiveFactor;

          setTransform(applyConstraints(newX, newY, clampedK));
      }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      if (e.touches.length < 2) {
          gesture.current.isPinching = false;
      }
  };

  // --- WebGL Rendering (Unchanged) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const gl = canvas.getContext('webgl', { antialias: false });
    if (!gl) return;

    // Compile Shaders
    const compileShader = (src: string, type: number) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    };

    const vs = compileShader(VERTEX_SHADER, gl.VERTEX_SHADER);
    const fs = compileShader(FRAGMENT_SHADER, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Buffers
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Texture Calcs
    const totalBytes = gridSize * gridSize * tapeSize;
    let texDim = 128;
    while (texDim * texDim < totalBytes) {
      texDim *= 2;
    }

    // Uniforms
    gl.uniform1f(gl.getUniformLocation(program, 'uGridSize'), gridSize);
    gl.uniform1f(gl.getUniformLocation(program, 'uBlockSize'), blockSize);
    gl.uniform1f(gl.getUniformLocation(program, 'uTexSize'), texDim);

    // Textures
    const paletteTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    const paletteData = generatePalette();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, paletteData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.uniform1i(gl.getUniformLocation(program, 'uPalette'), 1);

    const stateTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stateTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, texDim, texDim, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, null);
    gl.uniform1i(gl.getUniformLocation(program, 'uState'), 0);

    const renderLoop = () => {
      if (running) {
        simulation.step(speed);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stateTex);
      
      const heightNeeded = Math.ceil(simulation.data.length / texDim);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texDim, heightNeeded, gl.LUMINANCE, gl.UNSIGNED_BYTE, simulation.data);
      
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafRef.current = requestAnimationFrame(renderLoop);
    };
    
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    renderLoop();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [simulation, running, speed, gridSize, tapeSize]);

  return (
    <div 
        ref={containerRef}
        className={`w-full h-full relative overflow-hidden bg-black select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
    >
        <canvas 
            ref={canvasRef} 
            width={1024} 
            height={1024} 
            className="absolute top-0 left-0 touch-none origin-top-left"
            style={{ 
                width: `${baseSize}px`,
                height: `${baseSize}px`,
                imageRendering: 'pixelated',
                transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.k})`
            }}
        />
        
        {/* Zoom Hint */}
        {transform.k === 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none text-white/90 text-xs font-mono select-none bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10 shadow-lg transition-opacity duration-500">
                Scroll / Pinch to Zoom
            </div>
        )}
    </div>
  );
};