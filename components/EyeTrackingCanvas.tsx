import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { Point, Results } from '../types';

// Left Iris indices: 468 (center), 469, 470, 471, 472
// Right Iris indices: 473 (center), 474, 475, 476, 477
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;

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

    // Ensure canvas matches video size if results.image is available
    if (results.image) {
        const img = results.image as HTMLVideoElement | ImageBitmap;
        if (img.width && img.height && (canvas.width !== img.width || canvas.height !== img.height)) {
             canvas.width = img.width;
             canvas.height = img.height;
        }
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw the video frame
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      
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

      if (pathRef.current.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = '#EF4444'; // Tailwind red-500
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.moveTo(pathRef.current[0].x, pathRef.current[0].y);
        for (let i = 1; i < pathRef.current.length; i++) {
            const point = pathRef.current[i];
            ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
      }

      ctx.fillStyle = '#00FF00';
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

    // Give a small delay to ensure script tag is loaded if it's async (though it's in head so should be fine)
    // But since it's a React effect, the DOM is ready.
    if (window.FaceMesh) {
        initMediaPipe();
    } else {
        // Fallback or retry if script loading is delayed (unlikely with sync script tag)
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