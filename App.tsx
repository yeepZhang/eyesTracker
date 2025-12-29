import React from 'react';
import { EyeTrackingCanvas } from './components/EyeTrackingCanvas';
import { Eye, Activity, ShieldCheck } from 'lucide-react';

const App: React.FC = () => {
  return (
    <div className="flex flex-col h-screen w-full bg-neutral-950 text-neutral-100 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-600/20 rounded-lg">
            <Eye className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">EyeTrace Pro</h1>
            <p className="text-xs text-neutral-400">Real-time Iris Tracking System</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-sm text-neutral-400">
           <div className="hidden md:flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-500" />
            <span>High Precision Mode</span>
           </div>
           <div className="hidden md:flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-500" />
            <span>Local Processing</span>
           </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/10 via-neutral-950 to-neutral-950 -z-10" />
        
        <div className="w-full max-w-5xl flex flex-col gap-6">
          <EyeTrackingCanvas />
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-neutral-400 text-sm">
             <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800">
                <h3 className="font-semibold text-neutral-200 mb-1">Instruction</h3>
                <p>Ensure good lighting. The red line traces your iris movement across the screen.</p>
             </div>
             <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800">
                <h3 className="font-semibold text-neutral-200 mb-1">Privacy</h3>
                <p>No video data is sent to the cloud. All processing happens locally in your browser.</p>
             </div>
             <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800">
                <h3 className="font-semibold text-neutral-200 mb-1">Controls</h3>
                <p>Use the buttons above to toggle tracking or reset the movement history lines.</p>
             </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
