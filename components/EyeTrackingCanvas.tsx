import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { Point, Results } from '../types';

// Left Iris indices: 468 (center), 469, 470, 471, 472
// Right Iris indices: 473 (center), 474, 475, 476, 477
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;

// Key feature contours for drawing the "mesh" lines
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
const LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61];
const LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];
const LEFT_EYE = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 33];
const RIGHT_EYE = [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382, 362];
const LEFT_EYEBROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const RIGHT_EYEBROW = [336, 296, 334, 293, 300, 276, 283, 282, 295, 285];

declare global {
  interface Window {
    FaceMesh: any;
  }
}

export const EyeTrackingCanvas: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  
  // Refs for tracking state and animation loop
  const pathRef = useRef<Point[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const faceMeshRef = useRef<any>(null);
  const requestRef = useRef<number | null>(null);
  const trackingRef = useRef<boolean>(false);

  const clearPath = () => {
    pathRef.current = [];
  };

  const drawPath = (ctx: CanvasRenderingContext2D, points: any[], indices: number[], closePath = false) => {
    if (indices.length < 2) return;
    
    ctx.beginPath();
    const firstPoint = points[indices[0]];
    ctx.moveTo(firstPoint.x * ctx.canvas.width, firstPoint.y * ctx.canvas.height);
    
    for (let i = 1; i < indices.length; i++) {
        const p = points[indices[i]];
        ctx.lineTo(p.x * ctx.canvas.width, p.y * ctx.canvas.height);
    }
    
    if (closePath) {
        ctx.closePath();
    }
    ctx.stroke();
  };

  const onResults = useCallback((results: Results) => {
    // Calculate FPS
    const now = performance.now();
    const delta = now - lastFrameTimeRef.current;
    if (delta > 0) {
      setFps(Math.round(1000 / delta));
    }
    lastFrameTimeRef.current = now;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ensure canvas matches video size
    if (results.image) {
        let width = 0;
        let height = 0;
        
        // Handle different image types
        if ('videoWidth' in results.image) {
             width = (results.image as HTMLVideoElement).videoWidth;
             height = (results.image as HTMLVideoElement).videoHeight;
        } else if ('width' in results.image) {
             width = results.image.width;
             height = results.image.height;
        }

        if (width && height && (canvas.width !== width || canvas.height !== height)) {
             canvas.width = width;
             canvas.height = height;
        }
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw the video frame
    if (results.image instanceof ImageData) {
        ctx.putImageData(results.image, 0, 0);
    } else {
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];

      // --- Draw Face Mesh Grid (Points) ---
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      for (const landmark of landmarks) {
          const x = landmark.x * canvas.width;
          const y = landmark.y * canvas.height;
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, 2 * Math.PI);
          ctx.fill();
      }

      // --- Draw Face Mesh Contours (Lines) ---
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 3;
      
      drawPath(ctx, landmarks, FACE_OVAL);
      drawPath(ctx, landmarks, LIPS_OUTER);
      drawPath(ctx, landmarks, LIPS_INNER);
      drawPath(ctx, landmarks, LEFT_EYE);
      drawPath(ctx, landmarks, RIGHT_EYE);
      drawPath(ctx, landmarks, LEFT_EYEBROW);
      drawPath(ctx, landmarks, RIGHT_EYEBROW);

      // --- Draw Iris Tracking ---
      const leftIris = landmarks[LEFT_IRIS_CENTER];
      const rightIris = landmarks[RIGHT_IRIS_CENTER];

      const midpoint = {
        x: (leftIris.x + rightIris.x) / 2 * canvas.width,
        y: (leftIris.y + rightIris.y) / 2 * canvas.height
      };

      pathRef.current.push(midpoint);
      
      if (pathRef.current.length > 300) {
        pathRef.current.shift();
      }

      // Draw Trajectory
      if (pathRef.current.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = '#EF4444'; // Tailwind red-500
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
        ctx.shadowBlur = 10;
        
        ctx.moveTo(pathRef.current[0].x, pathRef.current[0].y);
        for (let i = 1; i < pathRef.current.length; i++) {
            const point = pathRef.current[i];
            ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset shadow
      }

      // Draw Iris Centers (Highlight)
      ctx.fillStyle = '#10B981'; // Tailwind emerald-500
      const lx = leftIris.x * canvas.width;
      const ly = leftIris.y * canvas.height;
      const rx = rightIris.x * canvas.width;
      const ry = rightIris.y * canvas.height;

      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, 2 * Math.PI);
      ctx.arc(rx, ry, 4, 0, 2 * Math.PI);
      ctx.fill();
    }

    ctx.restore();
    setIsLoading(false);
  }, []);

  // Frame processing loop
  const processFrame = useCallback(async () => {
    if (!trackingRef.current) return;

    if (videoRef.current && faceMeshRef.current && videoRef.current.readyState >= 2) {
      try {
        await faceMeshRef.current.send({ image: videoRef.current });
      } catch (e) {
        console.warn("FaceMesh send error:", e);
      }
    }

    // Request next frame only if still tracking
    if (trackingRef.current) {
        requestRef.current = requestAnimationFrame(processFrame);
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            }
        });
        
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            // Play video once metadata is loaded
            videoRef.current.onloadedmetadata = () => {
                videoRef.current?.play();
            };
        }
        
        trackingRef.current = true;
        setIsTracking(true);
        processFrame();
    } catch (err) {
        console.error("Camera access error:", err);
        setError("Failed to access camera. Please allow camera permissions.");
        setIsLoading(false);
    }
  }, [processFrame]);

  const stopCamera = useCallback(() => {
     trackingRef.current = false;
     if (requestRef.current) {
         cancelAnimationFrame(requestRef.current);
         requestRef.current = null;
     }
     
     if (videoRef.current && videoRef.current.srcObject) {
         const stream = videoRef.current.srcObject as MediaStream;
         stream.getTracks().forEach(track => track.stop());
         videoRef.current.srcObject = null;
     }
     setIsTracking(false);
  }, []);

  const toggleTracking = () => {
    if (isTracking) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initMediaPipe = async () => {
      try {
        if (!window.FaceMesh) {
            throw new Error("MediaPipe FaceMesh library not loaded");
        }

        const faceMesh = new window.FaceMesh({
          locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`;
          },
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMesh.onResults(onResults);
        faceMeshRef.current = faceMesh;

        // Auto-start camera if mounted
        if (isMounted) {
            startCamera();
        }
      } catch (err) {
        console.error("Error initializing MediaPipe:", err);
        if (isMounted) {
            setError("Failed to initialize AI model. " + (err instanceof Error ? err.message : String(err)));
            setIsLoading(false);
        }
      }
    };

    if (window.FaceMesh) {
        initMediaPipe();
    } else {
        const checkInterval = setInterval(() => {
            if (window.FaceMesh) {
                clearInterval(checkInterval);
                initMediaPipe();
            }
        }, 100);
        setTimeout(() => clearInterval(checkInterval), 5000);
    }

    return () => {
      isMounted = false;
      stopCamera();
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
      }
    };
  }, [onResults, startCamera, stopCamera]);

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-neutral-900 p-4 rounded-xl border border-neutral-800 shadow-lg">
        <div className="flex items-center gap-3">
            <button
                onClick={toggleTracking}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                isTracking 
                    ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20' 
                    : 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/20'
                }`}
            >
                {isTracking ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isTracking ? 'Stop Tracking' : 'Start Tracking'}
            </button>
            
            <button
                onClick={clearPath}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-all border border-neutral-700"
            >
                <RefreshCw className="w-4 h-4" />
                Reset Path
            </button>
        </div>
        
        <div className="flex items-center gap-4 text-sm font-mono text-neutral-500">
            <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isTracking ? 'bg-green-500 animate-pulse' : 'bg-neutral-600'}`}></span>
                {isTracking ? 'CAMERA ACTIVE' : 'CAMERA PAUSED'}
            </span>
            <span>FPS: {fps}</span>
        </div>
      </div>

      {/* Main Visualizer Area */}
      <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-neutral-800 group">
        
        {/* Loading Overlay */}
        {isLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-neutral-900/90 text-neutral-400">
                <Loader2 className="w-10 h-10 animate-spin mb-4 text-red-500" />
                <p>Initializing Neural Networks...</p>
            </div>
        )}

        {/* Error Overlay */}
        {error && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-neutral-900/95 text-red-400">
                <AlertCircle className="w-12 h-12 mb-4" />
                <p className="text-lg font-medium">{error}</p>
                <button 
                    onClick={() => window.location.reload()}
                    className="mt-4 px-4 py-2 bg-red-900/50 rounded-lg hover:bg-red-900/70 transition-colors text-white text-sm"
                >
                    Reload Application
                </button>
            </div>
        )}

        {/* Video Element (Hidden, used as source) */}
        <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover opacity-0" 
            playsInline
            muted
        />

        {/* Canvas Element (Visible, draws video + overlay) */}
        {/* We flip the container to act as a mirror for the user */}
        <div className="w-full h-full transform scale-x-[-1]">
             <canvas
                ref={canvasRef}
                className="w-full h-full object-cover"
            />
        </div>

        {/* Overlay Info */}
        <div className="absolute bottom-4 left-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-neutral-300 border border-white/10">
            MediaPipe FaceMesh • Iris Tracking Enabled
        </div>
      </div>
    </div>
  );
};