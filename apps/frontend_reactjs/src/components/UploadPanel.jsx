import React, { useEffect, useState, useRef } from 'react';
import { UploadCloud, File, CheckCircle2, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

export default function UploadPanel({ setIsProcessing, apiGateway }) {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [dragActive, setDragActive] = useState(false);
  const [pipelineState, setPipelineState] = useState(null); // null | 'uploading' | 'stored' | 'embedding' | 'ready' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch(`${apiGateway}/api/categories`);
        if (!res.ok) throw new Error('Failed to fetch categories');
        const json = await res.json();
        const data = json.data || [];
        setCategories(data);
        if (data.length > 0) {
          setSelectedCategory(data[0].key);
        }
      } catch (err) {
        console.error('Failed to load categories', err);
      } finally {
        setLoading(false);
      }
    }
    fetchCategories();
  }, [apiGateway]);

  const handleFile = async (file) => {
    if (!file || !selectedCategory) return;

    setPipelineState('uploading');
    setErrorMsg('');
    setIsProcessing(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', selectedCategory);

    try {
      // Simulate intermediate UI states while the request is running
      // The actual API call is a single long-running request.
      const timer1 = setTimeout(() => {
        setPipelineState(prev => prev === 'uploading' ? 'stored' : prev);
      }, 1500);
      const timer2 = setTimeout(() => {
        setPipelineState(prev => (prev === 'stored' || prev === 'uploading') ? 'embedding' : prev);
      }, 3500);

      const res = await fetch(`${apiGateway}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      clearTimeout(timer1);
      clearTimeout(timer2);

      const json = await res.json();
      if (!res.ok) {
        setPipelineState('error');
        if (json.code === 'FILE_TOO_LARGE') {
          const received = json.receivedFileSizeMB ? json.receivedFileSizeMB : 'Unknown';
          setErrorMsg(`The selected file is ${received} MB. Maximum supported upload size is ${json.maxUploadSizeMB} MB.`);
        } else {
          setErrorMsg(json.message || 'Server error');
        }
        return;
      }

      setPipelineState('ready');
      setTimeout(() => {
        setPipelineState(null);
      }, 3000);
    } catch (err) {
      console.error('❌ Upload failed', err);
      setPipelineState('error');
      setErrorMsg('Upload failed. Check backend logs.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };
  
  const PipelineStage = ({ state, currentStage, label, isActive }) => (
    <div className={cn("flex items-center gap-2 transition-opacity duration-300", isActive ? "opacity-100" : "opacity-40")}>
      {state === currentStage ? (
        <Loader2 className="animate-spin text-teal-400" size={16} />
      ) : (
        <CheckCircle2 className={cn("text-charcoal-600", state === 'ready' || isActive ? "text-teal-400" : "")} size={16} />
      )}
      <span className="text-xs font-medium">{label}</span>
    </div>
  );

  return (
    <div className="bg-charcoal-900 border-b border-charcoal-800 p-4 shrink-0 shadow-sm z-10 relative">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-6">
        
        {/* Left: Category Selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-charcoal-300">Category:</span>
          {loading ? (
            <div className="w-32 h-9 bg-charcoal-800 animate-pulse rounded-md"></div>
          ) : (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={pipelineState !== null && pipelineState !== 'error'}
              className="bg-charcoal-950 border border-charcoal-800 text-charcoal-50 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
            >
              {categories.map((cat) => (
                <option key={cat.key} value={cat.key}>{cat.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Right: Upload Zone or Pipeline Status */}
        <div className="flex-1 flex justify-end">
          <AnimatePresence mode="wait">
            {pipelineState === null ? (
              <motion.div
                key="upload-zone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "relative w-full max-w-sm flex items-center gap-4 px-4 py-2 border-2 border-dashed rounded-lg transition-colors",
                  dragActive ? "border-teal-500 bg-teal-500/10" : "border-charcoal-700 bg-charcoal-950/50 hover:border-charcoal-600"
                )}
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onDragOver={onDragOver}
                onDrop={onDrop}
              >
                <div className="bg-charcoal-800 p-2 rounded-full">
                  <UploadCloud size={18} className="text-charcoal-300" />
                </div>
                <div className="flex flex-col flex-1">
                  <span className="text-sm font-medium text-charcoal-200">Drag & drop document</span>
                  <span className="text-xs text-charcoal-500">PDF, Word, PPTX</span>
                </div>
                <Button 
                  size="sm" 
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </motion.div>
            ) : pipelineState === 'error' ? (
              <motion.div
                key="error-zone"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-sm flex items-center justify-between px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg"
              >
                <div className="flex items-center gap-3 text-red-400">
                  <X size={18} />
                  <span className="text-sm font-medium">{errorMsg}</span>
                </div>
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setPipelineState(null)}>
                  Dismiss
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="pipeline-zone"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-lg flex items-center justify-between px-6 py-3 bg-charcoal-950 border border-charcoal-800 rounded-lg"
              >
                <PipelineStage state={pipelineState} currentStage="uploading" label="Uploading" isActive={true} />
                <div className="w-8 border-t border-charcoal-800"></div>
                <PipelineStage state={pipelineState} currentStage="stored" label="Stored" isActive={pipelineState === 'stored' || pipelineState === 'embedding' || pipelineState === 'ready'} />
                <div className="w-8 border-t border-charcoal-800"></div>
                <PipelineStage state={pipelineState} currentStage="embedding" label="Embedding" isActive={pipelineState === 'embedding' || pipelineState === 'ready'} />
                <div className="w-8 border-t border-charcoal-800"></div>
                <PipelineStage state={pipelineState} currentStage="ready" label="Ready" isActive={pipelineState === 'ready'} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
