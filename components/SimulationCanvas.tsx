import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { BFFSimulation, generatePalette } from '../services/bffSimulation';

interface SimulationCanvasProps {
  simulation: BFFSimulation;
  running: boolean;
  speed: number;
  onCellClick?: (x: number, y: number) => void;
  autoStep?: boolean; // If true, the canvas component drives the loop (fallback mode)
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

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ simulation, running, speed, onCellClick, autoStep = false }) => {
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

  // --- WebGL Rendering ---
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
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Texture for State
    const stateTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stateTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Texture for Palette
    const paletteTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    
    // Upload Palette immediately (it doesn't change often/ever)
    const paletteData = generatePalette();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, paletteData);

    // Uniforms
    const uState = gl.getUniformLocation(program, "uState");
    const uPalette = gl.getUniformLocation(program, "uPalette");
    const uGridSize = gl.getUniformLocation(program, "uGridSize");
    const uBlockSize = gl.getUniformLocation(program, "uBlockSize");
    const uTexSize = gl.getUniformLocation(program, "uTexSize");

    // Render Loop
    const render = () => {
      if (!canvas) return;

      // Update Physics (if this component owns the loop)
      if (running) {
         simulation.step(speed);
      }

      // Update Texture
      const totalBytes = simulation.data.length;
      const exactSide = Math.sqrt(totalBytes);
      
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      
      // Use LUMINANCE to pass raw bytes (0-255).
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, exactSide, exactSide, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, simulation.data);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);
      
      gl.uniform1i(uState, 0);
      gl.uniform1i(uPalette, 1);
      gl.uniform1f(uGridSize, simulation.config.gridWidth);
      gl.uniform1f(uBlockSize, Math.sqrt(simulation.config.tapeSize)); // Visual block size
      gl.uniform1f(uTexSize, exactSide);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      rafRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [simulation, running, speed, canvasRef.current]);

  return (
    <div 
        ref={containerRef}
        className="w-full h-full relative overflow-hidden bg-gray-950 cursor-crosshair touch-none"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp} // Stop drag if leaving
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
    >
        <canvas 
            ref={canvasRef}
            width={baseSize} // Canvas resolution
            height={baseSize}
            style={{
                width: `${baseSize}px`,
                height: `${baseSize}px`,
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
                transformOrigin: 'top left',
                imageRendering: 'pixelated' // Critical for retro look
            }}
        />
    </div>
  );
};