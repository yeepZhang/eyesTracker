export interface Point {
  x: number;
  y: number;
}

export interface EyeState {
  isTracking: boolean;
  leftIris: Point | null;
  rightIris: Point | null;
}

// Minimal type definition for MediaPipe FaceMesh to avoid extensive external type dependencies in this snippets
export interface FaceMeshOptions {
  maxNumFaces?: number;
  refineLandmarks?: boolean;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

export interface Results {
  multiFaceLandmarks: Array<Array<{ x: number; y: number; z: number }>>;
  image: HTMLVideoElement | HTMLCanvasElement | ImageData;
}
