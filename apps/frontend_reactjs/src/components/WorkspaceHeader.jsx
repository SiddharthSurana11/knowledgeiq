import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, CheckCircle2, Loader2, X, Search, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { Dropdown } from './ui/dropdown';

export function WorkspaceHeader({ 
  categories, 
  documents,
  searchScope,
  setSearchScope,
  filterCategory, 
  setFilterCategory, 
  filterDocumentId,
  setFilterDocumentId,
  setIsProcessing, 
  apiGateway,
  onDocumentUploaded
}) {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [pipelineState, setPipelineState] = useState(null); 
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].key);
    }
  }, [categories, selectedCategory]);

  const handleFile = async (file) => {
    if (!file || !selectedCategory) return;
    setPipelineState('uploading');
    setErrorMsg('');
    setIsProcessing(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', selectedCategory);

    try {
      const timer1 = setTimeout(() => setPipelineState(prev => prev === 'uploading' ? 'stored' : prev), 1000);
      const timer2 = setTimeout(() => setPipelineState(prev => (prev === 'stored' || prev === 'uploading') ? 'embedding' : prev), 2500);

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
      if (onDocumentUploaded) onDocumentUploaded();
      setTimeout(() => setPipelineState(null), 2500);
    } catch (err) {
      setPipelineState('error');
      setErrorMsg('Upload failed.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onDragEnter = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
  };
  const onDragOver = (e) => {
    e.preventDefault(); e.stopPropagation();
  };
  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };
  
  const PipelineStage = ({ state, currentStage, label, isActive }) => (
    <div className={cn("flex items-center gap-1.5 transition-all duration-300", isActive ? "opacity-100" : "opacity-40")}>
      {state === currentStage ? (
        <Loader2 className="animate-spin text-teal-400" size={12} />
      ) : (
        <CheckCircle2 className={cn("text-charcoal-600", state === 'ready' || isActive ? "text-teal-400" : "")} size={12} />
      )}
      <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
    </div>
  );

  const categoryOptions = categories.map(cat => ({ label: cat.name, value: cat.key }));
  const searchOptions = [{ label: "All Categories", value: "" }, ...categoryOptions];

  return (
    <div className="bg-charcoal-1000 border-b border-charcoal-800 px-4 md:px-6 py-3 shrink-0 shadow-sm z-20 relative">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6">
        
        {/* Left: Global Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Search size={14} className="text-charcoal-400 shrink-0" />
            <div className="w-[140px]">
              <Dropdown 
                value={searchScope}
                onChange={setSearchScope}
                options={[
                  { label: "Global Search", value: "global" },
                  { label: "Category", value: "category" },
                  { label: "Document", value: "document" }
                ]}
                placeholder="Scope..."
                className="!py-1.5 !px-2.5 text-xs bg-charcoal-950"
              />
            </div>
          </div>
          
          {searchScope === 'category' && (
            <div className="w-[180px]">
              <Dropdown 
                value={filterCategory}
                onChange={setFilterCategory}
                options={categories.map(c => ({ label: c.name, value: c.key }))}
                placeholder="Category..."
                className="!py-1.5 !px-2.5 text-xs bg-charcoal-950"
              />
            </div>
          )}

          {searchScope === 'document' && (
            <div className="w-[260px] md:w-[300px]">
              <Dropdown 
                value={filterDocumentId}
                onChange={setFilterDocumentId}
                options={documents.map(d => ({ label: d.filename, value: d.documentId }))}
                placeholder="Document..."
                className="!py-1.5 !px-2.5 text-xs bg-charcoal-950"
              />
            </div>
          )}
        </div>

        {/* Right: Upload Zone */}
        <div className="flex-1 flex justify-end items-center gap-4 min-w-[300px]">
          {/* Temporary Upload Category Selector */}
          <div className="flex items-center gap-2 border-r border-charcoal-800 pr-4 hidden md:flex">
            <Database size={14} className="text-charcoal-500 shrink-0" />
            <div className="w-[130px]">
              <Dropdown 
                value={selectedCategory}
                onChange={setSelectedCategory}
                options={categoryOptions}
                placeholder="Category..."
                className="!py-1.5 !px-2.5 text-xs bg-charcoal-950 border-dashed"
              />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {pipelineState === null ? (
              <motion.div
                key="upload-zone"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "relative flex items-center gap-3 px-4 py-1.5 border border-dashed rounded-md transition-colors cursor-pointer group w-full max-w-[320px]",
                  dragActive ? "border-teal-500 bg-teal-500/10" : "border-charcoal-700 bg-charcoal-950 hover:border-charcoal-500"
                )}
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud size={16} className={cn("transition-colors", dragActive ? "text-teal-400" : "text-charcoal-400 group-hover:text-charcoal-300")} />
                <span className={cn("text-xs font-medium transition-colors", dragActive ? "text-teal-400" : "text-charcoal-300 group-hover:text-charcoal-100")}>
                  Drag & drop file or click to upload
                </span>
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
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md md:max-w-lg flex items-center justify-between px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-md shadow-lg"
              >
                <div className="flex items-center gap-2 text-red-400 pr-2">
                  <X size={14} className="shrink-0" />
                  <span className="text-xs font-medium text-red-300 leading-snug" title={errorMsg}>{errorMsg}</span>
                </div>
                <button className="text-[10px] uppercase font-bold text-red-400 hover:text-red-200 shrink-0 ml-2" onClick={() => setPipelineState(null)}>
                  Dismiss
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="pipeline-zone"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-[320px] flex items-center justify-between px-4 py-1.5 bg-charcoal-950 border border-charcoal-800 rounded-md"
              >
                <PipelineStage state={pipelineState} currentStage="uploading" label="Upload" isActive={true} />
                <div className="w-4 border-t border-charcoal-800"></div>
                <PipelineStage state={pipelineState} currentStage="stored" label="Store" isActive={pipelineState === 'stored' || pipelineState === 'embedding' || pipelineState === 'ready'} />
                <div className="w-4 border-t border-charcoal-800"></div>
                <PipelineStage state={pipelineState} currentStage="embedding" label="Embed" isActive={pipelineState === 'embedding' || pipelineState === 'ready'} />
                <div className="w-4 border-t border-charcoal-800"></div>
                <PipelineStage state={pipelineState} currentStage="ready" label="Ready" isActive={pipelineState === 'ready'} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
